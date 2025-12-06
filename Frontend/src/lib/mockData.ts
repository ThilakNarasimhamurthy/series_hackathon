export const MOCK_CRISIS_ALERTS = [
    {
        id: "alert-1",
        severity: "critical",
        user_alias: "Anonymous User",
        mood_score: 1, // 🆘
        mood_trend: [3, 3, 2, 2, 1, 1, 1], // Declining
        message_preview: "I don't <span class='highlight'>want to be here</span> anymore. I can't do this.",
        detected_keywords: ["want to be here", "can't do this"],
        timestamp: "2 min ago",
    },
    {
        id: "alert-2",
        severity: "high",
        user_alias: "Helper123",
        mood_score: 2, // 😰
        mood_trend: [4, 4, 3, 3, 2, 2, 2],
        message_preview: "The panic is getting worse, I feel like I'm <span class='highlight'>drowning</span>.",
        detected_keywords: ["drowning", "panic"],
        timestamp: "5 min ago",
    },
]

export const MOCK_ACTIVE_CHATS = [
    {
        id: "chat-1",
        user_alias: "BlueSky",
        type: "peer",
        unread_count: 2,
        last_message: "I just feel really overwhelmed with school right now.",
        timestamp: "2m ago",
        mood_emoji: "😞",
        mood_trend_data: [
            { day: 'M', score: 3 },
            { day: 'T', score: 2 },
            { day: 'W', score: 2 },
            { day: 'T', score: 1 },
            { day: 'F', score: 2 },
            { day: 'S', score: 2 },
            { day: 'S', score: 1 },
        ],
        message_history: [
            { sender: "receiver", text: "Hi, is anyone there?", time: "10:30 AM" },
            { sender: "responder", text: "Hi BlueSky, I'm here. What's on your mind?", time: "10:31 AM" },
            { sender: "receiver", text: "I just feel really overwhelmed with school right now.", time: "10:32 AM" },
        ]
    },
    {
        id: "chat-2",
        user_alias: "Anonymous User",
        type: "crisis",
        unread_count: 0,
        last_message: "Thanks for listening, that actually helps a bit.",
        timestamp: "5m ago",
        mood_emoji: "😰",
        mood_trend_data: [
            { day: 'M', score: 4 },
            { day: 'T', score: 3 },
            { day: 'W', score: 3 },
            { day: 'T', score: 2 },
            { day: 'F', score: 1 },
            { day: 'S', score: 1 },
            { day: 'S', score: 2 },
        ],
        message_history: [
            { sender: "receiver", text: "It hurts too much.", time: "10:40 AM" },
            { sender: "responder", text: "I hear you. I'm here. Can you tell me what happened?", time: "10:41 AM" },
            { sender: "receiver", text: "Thanks for listening, that actually helps a bit.", time: "10:45 AM" },
        ]
    },
    {
        id: "chat-3",
        user_alias: "Riley",
        type: "general",
        unread_count: 0,
        last_message: "I'll try the breathing exercise you mentioned.",
        timestamp: "1h ago",
        mood_emoji: "😐",
        mood_trend_data: [
            { day: 'M', score: 3 },
            { day: 'T', score: 3 },
            { day: 'W', score: 3 },
            { day: 'T', score: 4 },
            { day: 'F', score: 4 },
            { day: 'S', score: 3 },
            { day: 'S', score: 3 },
        ],
        message_history: [
            { sender: "responder", text: "Have you tried 4-7-8 breathing?", time: "9:00 AM" },
            { sender: "receiver", text: "No, what is that?", time: "9:05 AM" },
            { sender: "receiver", text: "I'll try the breathing exercise you mentioned.", time: "9:10 AM" },
        ]
    },
]
