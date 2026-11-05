# העלאת הגרסה המעודכנת והמאובטחת — צ׳קליסט

## 1. גיבוי (מומלץ)
Supabase ← Database ← Backups — לוודא שיש גיבוי מהיום (או לייצא את הנתונים).

## 2. קובץ אבטחה ותיקוני מלאי
Supabase ← SQL Editor ← להדביק את כל הקובץ `sql/patch-2026-11-security-and-integrity.sql` ← Run.

## 3. רשימת משתמשים מורשים
באותו מקום ← להדביק את `sql/patch-2026-11-crm-users-allowlist.sql` ← Run.
משתמשים שכבר קיימים מתווספים לרשימה אוטומטית.

## 4. כיבוי הרשמה חופשית
Authentication ← Sign In / Providers ← לכבות **Allow new users to sign up**.

## 5. העלאת הקוד
למזג את הענף `claude/gallant-edison-tfuwan` ל-`main` (בפריסה דרך Vercel היא תתבצע אוטומטית).

## 6. בדיקה קצרה אחרי העלייה
- [ ] התחברות — כל המסכים נטענים
- [ ] הוספת פריט מלאי לבדיקה → מופיעה הודעה "הפריט נוסף למלאי" → למחוק אותו
- [ ] רשימת חייבים — הסכומים נראים תקינים

## הוספת עובד חדש בעתיד
אחרי יצירת המשתמש ב-Authentication ← Users, להריץ ב-SQL Editor (עם האימייל שלו):

```sql
INSERT INTO public.crm_users (user_id)
SELECT id FROM auth.users WHERE email = 'worker@example.com';
```

בלי זה העובד יוכל להתחבר, אבל יראה מערכת ריקה.
