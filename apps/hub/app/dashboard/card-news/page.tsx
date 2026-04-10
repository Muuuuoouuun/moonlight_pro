"use client"
import { useState } from "react"

export default function CardNewsEditor() {
  const [content, setContent] = useState("## 카드뉴스 제목을 입력하세요\n\n내용을 작성하세요...")
  return (
    <div className="flex h-screen gap-4 p-8">
      <textarea 
        className="flex-1 border p-4 rounded-lg font-mono"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="카드뉴스 내용을 입력하세요"
      />
      <div className="flex-1 border p-4 bg-white shadow-sm overflow-auto">
        <h2 className="text-xl font-bold mb-4">실시간 미리보기</h2>
        <div className="prose" dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }} />
      </div>
    </div>
  )
}
