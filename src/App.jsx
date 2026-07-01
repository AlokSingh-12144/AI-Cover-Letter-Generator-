import { useState, useRef } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

function App() {
  const [form, setForm] = useState({ name: '', role: '', company: '', skills: '' })
  const [resumeText, setResumeText] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const extractInfoFromResume = async (text) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      console.warn('API key not found, skipping resume auto-fill.')
      return
    }
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const prompt = `You are an expert resume parsing assistant. Extract the following information from this resume text:
1. Candidate Name (e.g. "John Doe")
2. Key Skills (as a comma-separated list, e.g. "React, Node.js, Python")
3. Typical or most recent Job Role (e.g. "Software Engineer")

Provide the extracted data in raw JSON format matching this schema:
{
  "name": "string",
  "skills": "string",
  "role": "string"
}
Do not wrap it in anything else, output only the JSON object. Do not include markdown code block formatting (like \`\`\`json).

Resume:
${text}`

      const result = await model.generateContent(prompt)
      const responseText = result.response.text().trim()
      const cleanJsonStr = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const parsedData = JSON.parse(cleanJsonStr)
      
      setForm((prev) => ({
        ...prev,
        name: parsedData.name || prev.name,
        skills: parsedData.skills || prev.skills,
        role: parsedData.role || prev.role,
      }))
    } catch (err) {
      console.error('Failed to auto-fill details from resume:', err)
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item) => item.str).join(' ')
        text += pageText + '\n'
      }
      
      const trimmedText = text.trim().slice(0, 3000)
      setResumeText(trimmedText)
      
      if (trimmedText) {
        await extractInfoFromResume(trimmedText)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to parse PDF file: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const generateTemplate = () => {
    const { name, role, company, skills } = form
    return `Dear Hiring Manager at ${company},\n\nI am ${name}, writing to express my interest in the ${role} position. With expertise in ${skills}, I am confident in my ability to contribute effectively to your team.\n\n${resumeText ? `My background includes:\n${resumeText}\n\n` : ''}I would welcome the opportunity to discuss how my experience aligns with your needs.\n\nSincerely,\n${name}`
  }

  const generateWithAI = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      setError('Add your Gemini API key to .env file')
      return
    }
    setLoading(true)
    setError('')
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const { name, role, company, skills } = form
      const prompt = `Write a professional cover letter for ${name} applying for ${role} at ${company}. Key skills: ${skills}. ${resumeText ? `Resume context: ${resumeText}` : ''}. Return only the cover letter in markdown format.`
      const result = await model.generateContent(prompt)
      setOutput(result.response.text())
    } catch (err) {
      setError(err.message)
      setOutput(generateTemplate())
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output || generateTemplate())
  }

  const markdownToHtml = (text) => {
    return text
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  return (
    <main className="app">
      <header>
        <h1>Cover Letter Generator</h1>
      </header>
      <section className="grid">
        <form onSubmit={(e) => e.preventDefault()} aria-label="Cover letter form">
          <div className="field">
            <label htmlFor="name">Your Name *</label>
            <input id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="role">Job Role *</label>
            <input id="role" name="role" value={form.role} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="company">Target Company *</label>
            <input id="company" name="company" value={form.company} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="skills">Key Skills *</label>
            <textarea id="skills" name="skills" value={form.skills} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="resume">Upload Resume (PDF)</label>
            <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                id="resume"
                type="file"
                accept=".pdf"
                onChange={handleFile}
                hidden
              />
              {resumeText ? 'Resume loaded ✓' : 'Click or drag PDF here'}
            </div>
          </div>
          <div className="actions">
            <button type="button" onClick={generateWithAI} disabled={loading || !form.name || !form.role || !form.company || !form.skills}>
              {loading ? 'Generating...' : 'Generate with AI'}
            </button>
            <button type="button" onClick={() => setOutput(generateTemplate())} disabled={!form.name || !form.role || !form.company || !form.skills}>
              Use Template
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        <section className="output" aria-live="polite">
          <div className="toolbar">
            <h2>Generated Cover Letter</h2>
            <button onClick={copyToClipboard} disabled={!output && !form.name} aria-label="Copy to clipboard">
              Copy
            </button>
          </div>
          <div
            className="letter"
            dangerouslySetInnerHTML={{ __html: output ? markdownToHtml(output) : '' }}
          />
        </section>
      </section>
    </main>
  )
}

export default App