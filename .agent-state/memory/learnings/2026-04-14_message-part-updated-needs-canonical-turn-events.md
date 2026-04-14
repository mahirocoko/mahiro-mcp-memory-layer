# Learning Note: message.part.updated needs canonical turn normalization

Tags: memory, opencode-plugin, event-ingestion, turn-normalization, retrospective

## Insight
ปัญหา memory ไม่โตใน plugin path อาจไม่ได้อยู่ที่ memory write policy หรือ storage backend แต่อยู่ที่ event ingestion ก่อนหน้านั้น ถ้า host ส่ง `message.part.updated` เป็นหลัก แต่ adapter นับเฉพาะ `message.updated` ว่าเป็น turn update ระบบจะไม่ refresh `recentConversation`, ไม่ bump `messageVersion`, และไม่ invalidate/read precompute cache อย่างถูกต้อง ทำให้อาการภายนอกดูเหมือน memory ไม่จำอะไรเพิ่มเลย

## Why it mattered
การพยายามแก้ที่ชั้น memory core หรือย้ายไปพึ่ง Claude hooks ตั้งแต่แรกจะเป็นการแก้ผิดชั้น ปัญหาจริงคือเราต้องแปลง incremental host events ให้กลายเป็น canonical turn semantics ก่อน แล้วค่อยปล่อยให้ persistence boundary เดิม (`session.idle`) ทำงานต่อ

## Durable takeaway
เวลาออกแบบ memory adapter ให้แยก 3 ชั้นให้ชัด:
1. event ingestion
2. turn normalization
3. semantic memory write

ถ้าขั้นที่ 2 หายไป ระบบจะดูเหมือนพังทั้งก้อนทั้งที่ persistence layer ยังดีอยู่
