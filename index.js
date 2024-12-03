const express = require("express");
const client = require("prom-client") // Metric Collection
const responseTime = require("response-time");
const {doSomeHeavyTask} = require("./util")

const { createLogger, transports } = require("winston");
const LokiTransport = require("winston-loki");
const options = {
  transports: [
    new LokiTransport({
     labels:{
        appName: "express"
     },
      host: "http://127.0.0.1:3100"
    })
  ]
};
const logger = createLogger(options);

const app = express();
const PORT = process.env.PORT || 8000;

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({register: client.register});

const reqResTime = new client.Histogram({
    name: "http_express_req_res_time",
    help: "This tells how much time is taken by req and res",
    labelNames: ["method", "route", "status_code"],
    buckets: [1, 50, 100, 200, 400, 500, 800, 1000, 2000],
});

const totalReqCounter = new client.Counter({
    name: 'total_req',
    help: 'Tells total req'
})

app.use(responseTime((req, res, time) => {
    totalReqCounter.inc();
    const route = req.route ? req.route.path : req.url.split("?")[0]; // Handle routes or raw URLs
    reqResTime
        .labels(req.method, route, res.statusCode.toString()) // Correct argument usage
        .observe(time); // Record the response time
}))

app.get("/", (req, res) => {
    logger.info('Req came on / router')
    return res.json({message: `Hello from Express Server`});
});

app.get("/slow", async (req, res) => {
    try {
        logger.info('Req came on /slow router')
        const timeTaken = await doSomeHeavyTask();
        return res.json({
            status: "Success",
            message: `Heavy task completed in ${timeTaken}ms`,
        });
    } catch (error) {
        logger.error(`${error.message}`)
        return res
            .status(500)
            .json({ status: "Error", error: "Internal Server Error" });
    }
});

app.get("/metrics", async(req, res) =>{
    res.setHeader("Content-Type", client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics)
})


app.listen(PORT, () =>
    console.log(`Express Server Started at http://localhost:${PORT}`)
)