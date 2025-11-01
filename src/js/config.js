import * as i18n from './i18n.js';

export const CONFIG = {
    "forum_title": "BlurtBB",
    "DEFAULT_THEME": "flatly", // The default Bootswatch theme. User can override this in their settings.
    "main_tag": "blurtbb",
    "tag_prefix": "fdsfdsf-",
    "admins": ["fervi"],
    "moderators": [],
    "category_groups": [
        {
            "group_title": "Welcome",
            "categories": [
                {
                    "id": "announcements",
                    "title": "Announcements",
                    "description": "Official news and updates from the team.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "introductions",
                    "title": "Introductions",
                    "description": "Say hello and introduce yourself to the community.",
                    "count": 2 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "support",
                    "title": "Help & Support",
                    "description": "Get help with using the forum or Blurt.",
                    "count": 2 // This will be updated dynamically based on the number of posts in this category
                }
            ]
        },
        {
            "group_title": "Blurt Ecosystem",
            "categories": [
                {
                    "id": "general",
                    "title": "General Discussion",
                    "description": "General chat about the Blurt blockchain.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "development",
                    "title": "Development & DApps",
                    "description": "Discuss technical details, development, and applications on Blurt.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                }
            ]
        },
        {
            "group_title": "Community",
            "categories": [
                {
                    "id": "witnesses",
                    "title": "Witnesses",
                    "description": "Discussions about Blurt witnesses.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "contests",
                    "title": "Contests",
                    "description": "Share Contests",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "promotion",
                    "title": "Post Promotion",
                    "description": "Share your Post here",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
            ]
        },
        {
            "group_title": "Off Topic",
            "categories": [
                {
                    "id": "off-topic",
                    "title": "Off-Topic",
                    "description": "For everything else.",
                    "count": 3 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "ai",
                    "title": "About AI, Machine Learn, ChatGPT, Gemini...",
                    "description": "Share your last discovery",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "conspirations",
                    "title": "Share Conspirations",
                    "description": "Share your theory.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },          
            ]
        }
        ,
        {
            "group_title": "Crypto",
            "categories": [ 
                {
                    "id": "news",
                    "title": "Crypto News",
                    "description": "News about crypto",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "faucets",
                    "title": "Faucets",
                    "description": "Share Crypto faucets here",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                },
                {
                    "id": "trading",
                    "title": "Trading & Markets",
                    "description": "Price, markets, and speculation.",
                    "count": 0 // This will be updated dynamically based on the number of posts in this category
                }        
            ]
        }
    ]
};
