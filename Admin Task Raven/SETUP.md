# إعداد Discord للوحة إدارة الطاقم (Admin Task Raven)

## متطلبات أساسية

- حساب مدير على Discord
- صلاحية إنشاء تطبيق في [Discord Developer Portal](https://discord.com/developers/applications)

---

## 1. إنشاء تطبيق Discord

1. افتح https://discord.com/developers/applications
2. اضغط **New Application**، اختر اسماً (مثل "Admin Task Raven")، ثم **Create**
3. من القائمة الجانبية، اختر **OAuth2**

### إعداد OAuth2

- **Redirects**: أضف الرابط التالي (بعد نشر الـ Web App):
  ```
  https://script.google.com/macros/s/SCRIPT_ID/exec
  ```
  (يمكنك الحصول على هذا الرابط بعد النشر الأول)
- **Default Authorization Link**: سجل Client ID و Client Secret

### إعداد Bot (للإشعارات)

1. من القائمة الجانبية، اختر **Bot** > **Add Bot**
2. تحت **Token**, اضغط **Reset Token** وانسخ التوكن
3. **(مهم)** فعّل الخيارات التالية أسفل الصفحة:
   - `PRESENCE INTENT`
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`

### دعوة البوت إلى السيرفر

1. من **OAuth2** > **OAuth2 URL Generator**
2. اختر **Scopes**: `bot`
3. اختر **Bot Permissions**: `Send Messages`, `Read Messages`
4. افتح الرابط الناتج واختر السيرفر لدعوة البوت

---

## 2. الحصول على Discord ID الخاص بك (للمدير)

1. افتح إعدادات Discord (الترس بجانب اسم المستخدم)
2. اذهب إلى **Advanced** > فعّل **Developer Mode**
3. اذهب إلى أي محادثة، اضغط كليك يمين على اسمك أو أي عضو > **Copy ID**

---

## 3. رفع الكود إلى Google Apps Script

### إنشاء المشروع

1. افتح https://script.google.com
2. اضغط **New project**
3. سمِّ المشروع (مثال: "Admin Task Raven")

### إضافة ملفات

1. في الملف `Code.gs` (الموجود افتراضياً):
   - احذف المحتوى الموجود
   - الصق محتوى ملف `Code.gs` من هذا المشروع

2. اذهب إلى **Files** > **New** > **HTML** وسمِّه `index`
   - الصق محتوى `index.html` من هذا المشروع

### ضبط Script Properties

اذهب إلى **Project Settings** > **Script Properties** وأضف:

| المفتاح | القيمة |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID من تطبيق Discord |
| `DISCORD_CLIENT_SECRET` | Client Secret من تطبيق Discord |
| `DISCORD_BOT_TOKEN` | Bot Token من تطبيق Discord |
| `DISCORD_ADMIN_ID` | Discord ID الخاص بك (المدير) |

### نشر الـ Web App

1. **Deploy** > **New deployment**
2. اختر **Web app**
3. **Execute as**: `Me` (أنت)
4. **Who has access**: `Anyone` (أي شخص لديه الرابط)
5. اضغط **Deploy**
6. انسخ Web App URL (مثل `https://script.google.com/macros/s/.../exec`)

### تحديث Redirect URI في Discord

1. عد إلى Discord Developer Portal > تطبيقك > OAuth2
2. أضف Web App URL إلى **Redirects**
3. احفظ

---

## 4. الاستخدام

### لأول مرة (المدير)

1. افتح Web App URL
2. اضغط **تسجيل الدخول عبر Discord**
3. سيتم توجيهك إلى Discord لتأكيد الدخول
4. بعد الموافقة، سيتم إنشاء حساب المدير تلقائياً
5. ستظهر لوحة التحكم مباشرة

### إضافة مشرفين جدد

1. اذهب إلى تبويب **حسابات المشرفين**
2. أدخل اسم المشرف و Discord ID الخاص به
3. حدد الرتب والأعضاء التي سيديرها
4. المشرف سيسجل دخوله عبر Discord بنفس الطريقة

### ربط أعضاء بـ Discord (للإشعارات)

1. اذهب إلى **الرتب والأعضاء**
2. عند إضافة عضو جديد أو تعديل عضو موجود
3. أدخل Discord ID الخاص بالعضو في حقل **Discord ID**
4. عندما يتم إضافة تسك للعضو، سيصله إشعار خاص في Discord

---

## هيكل الملفات

```
Admin Task Raven/
├── Code.gs       # الكود الخلفي (Google Apps Script)
├── index.html    # الواجهة الأمامية (HTML + CSS + JS)
└── SETUP.md      # تعليمات الإعداد (هذا الملف)
```
