import express from 'express';
import cors from 'cors';
import { generate } from './app.js';
import { requireAuth } from './auth.js';

const app=express();
const PORT=process.env.PORT || 3000;

// Same origins automation-portal's own SecurityConfig CORS bean already allows — the gateway
// is what actually fronts this in a real deployment, but direct-port access (dev/testing)
// still needs a real allow-list instead of reflecting every origin. CORS_ALLOWED_ORIGINS lets
// a real production domain be added without a code change (same env var/default as the two
// Java backends' cors.allowed-origins).
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS
    || 'http://localhost:15000,http://localhost:5173,http://localhost:5170,http://localhost:15173,http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json())


app.get('/', (req,res)=>{
    res.send("Welcome to ChatBoot")
}
)

app.post('/chat', requireAuth, async (req, res)=>{
    const {message} = req.body;

    if(!message){
        return res.status(400).json({message:"Message is required"});
    }

    console.log("Message ", message);

    // Cache key is derived from the verified JWT (username + project), never the client
    // body — a client-supplied key would let a project switch leak stale cross-project
    // context into the cached conversation, or let one session read/pollute another's cache.
    const cacheKey = `${req.auth.username}:${req.auth.projectId || 'none'}`;
    const result = await generate(message, cacheKey, req.auth.token);
    res.status(200).json({ message: result.message, toolResults: result.toolResults });
});


app.listen(PORT, ()=>{
    console.log(`Server is running on port ${PORT}`);
})