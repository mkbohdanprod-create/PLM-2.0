# Global Agent Rules for PLM Module

## STRICT RULE: NO TEST ORDERS GENERATION
**CRITICAL:** Under no circumstances should any AI agent generate test orders via SQL migrations, seed files, scripts, or any other automated mechanism. 
The user explicitly stated: "При міграції не створюй ніякі нові замовлення. Ти їх створюєш по якимось старим правилам, потім начинає хуячити. Я сам створю 2-3 замовлення. Зроби, щоб замовлення можна було створювати і все."

1. **DO NOT** write SQL `INSERT INTO orders` statements for test purposes.
2. **DO NOT** create or restore `seed.sql` files that populate the `orders` table.
3. If test orders are needed, instruct the user to create them manually via the UI.
