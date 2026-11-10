@AGENTS.md

## Git ish tartibi (har vazifa)
- master'ga to'g'ridan-to'g'ri push qilinmaydi.
- Har vazifa alohida branch: `feat/<qisqa-nom>` yoki `fix/<qisqa-nom>`.
- Ish tugagach: testlar, tsc, lint, build yashil → `git push -u origin <branch>` → `gh pr create` (sarlavha + qisqa tavsif: nima o'zgardi, testlar soni).
- Vercel preview deploy "Ready" bo'lishini kut (`gh pr checks --watch`), xato bo'lsa tuzat.
- Keyin `gh pr merge --squash --delete-branch` (yoki merge commit), master'ni `git pull` qil.
- Hisobotda: PR raqami/havolasi va master'dagi commit hash.
- Bir vazifada bir nechta mustaqil qism bo'lsa — har biri alohida PR (sun'iy bo'lak qilma).
- Commit'larda `Co-authored-by:` qatori faqat haqiqatan birga ishlagan, GitHub akkaunti bor odam uchun yoziladi (men aytsam).

## Sub-agentlar
- Katta vazifalarda (bir nechta mustaqil qism, ko'p fayl bo'ylab qidiruv, test + review + build tekshiruvi) ishni sub-agentlarga bo'lib, PARALLEL bajar (Agent/Task tool).
- Odatiy taqsimot: 1) Explore — kerakli fayl/kodni topadi; 2) asosiy agent — kodni yozadi; 3) parallel: testlar/tsc/lint/build tekshiruvchi va mustaqil code-review agenti (faqat muammolarni qaytaradi).
- Kichik ishlar (1–2 fayl, oddiy tuzatish) — sub-agentsiz, o'zing qil: token tejash (Ponytail).
- Sub-agentga aniq, qisqa vazifa ber; natijani o'zing tekshir, ko'r-ko'rona qabul qilma.
- Bir faylni ikki agent bir vaqtda tahrirlamasin.
- Hisobotda: qaysi sub-agentlar ishlatildi, nima qildi.

## Obsidian jurnal
- Har PR merge bo'lgach (yoki merge'ga tayyor bo'lganda) G:\obsidian-vault\Loyihalar\Buyuk Karavan sayti.md fayli oxiriga qisqa yozuv qo'sh:
  ### YYYY-MM-DD — PR #N: <sarlavha>
  - Nima o'zgardi: 2–4 qator, oddiy o'zbek tilida
  - Migratsiya: bor/yo'q · Testlar: X/X · Commit: <hash>
- Fayl yo'q bo'lsa — yarat (frontmatter: teglar: [buyuk-karavan, sayt]). Faqat oxiriga qo'sh, eski yozuvlarni o'zgartirma/o'chirma.
- Vault alohida git repo (Obsidian Git plagini o'zi sinxronlaydi) — u yerda git commit/push QILMA, faqat faylga yoz.
- Parol, token, .env qiymatlari jurnalga YOZILMASIN.
