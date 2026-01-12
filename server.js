import express from 'express'
import { startBot, getPairCode } from './index.js'

const app = express()
app.use(express.static("public"))
app.use(express.json())

app.post("/pair", async (req, res) => {
    const { number } = req.body

    if (!number) return res.json({ error: "Number required" })

    await startBot(number)

    setTimeout(() => {
        res.json({ code: getPairCode() })
    }, 3000)
})

app.listen(3000, () => {
    console.log("Web running on http://localhost:3000")
})
