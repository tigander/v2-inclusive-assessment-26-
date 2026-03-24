const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userPrompt, systemInstruction } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key.' });
    }

    try {
        // 1. Point to the 'data' directory
        const dataDir = path.join(process.cwd(), 'data');
        let knowledgeBaseText = "";
        
        // 2. Read EVERY .txt and .md file in the folder automatically
        try {
            if (fs.existsSync(dataDir)) {
                const files = fs.readdirSync(dataDir);
                
                for (const file of files) {
                    if (file.endsWith('.txt') || file.endsWith('.md')) {
                        const filePath = path.join(dataDir, file);
                        const content = fs.readFileSync(filePath, 'utf8');
                        
                        // Add a clear label so the AI knows which document this is
                        knowledgeBaseText += `\n\n=== SOURCE DOCUMENT: ${file} ===\n${content}\n`;
                    }
                }
            }
        } catch (fileError) {
            console.warn("Could not read the data directory. Proceeding without knowledge base.");
        }

        // 3. Combine base instructions with the combined knowledge base
        const enhancedSystemInstruction = `
You are an expert educational consultant specializing in inclusive education, universal design for learning (UDL), and equity in assessment. 

CRITICAL INSTRUCTIONS FOR YOUR RESPONSE FORMAT:
1. Tone & Perspective: Speak entirely in the first person ("I suggest," "Looking at this through the lens of a Māori learner, I notice..."). Reflect a lived-experience lens where appropriate.
2. Brevity & Transparency: Keep your recommendations extremely brief and format them as direct, actionable bullet points. 
3. Mixed Evidence: If the evidence or best practice for a specific accommodation is mixed, debated, or highly context-dependent, you MUST explicitly state this. Do not present contested ideas as absolute facts.
4. APA Referencing: You MUST ground your advice in the official frameworks provided below. When you refer to a document, use proper APA in-text citations (e.g., Ministry of Education, 2025). At the very end of your response, provide a "References" section using the exact APA citations provided at the top of the source documents.

--- START OF KNOWLEDGE BASE ---
${knowledgeBaseText}
--- END OF KNOWLEDGE BASE ---
`;

        // 4. Send to Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: enhancedSystemInstruction }] },
                generationConfig: {
                    temperature: 0.4, 
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ error: data.error?.message || 'Error from Gemini API' });
        }

        const generatedText = data.candidates[0].content.parts[0].text;
        return res.status(200).json({ text: generatedText });

    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
