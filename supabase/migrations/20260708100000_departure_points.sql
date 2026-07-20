ALTER TABLE branches ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS lng numeric;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS base_lat numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS base_lng numeric;

-- Оновлюємо філію Київ (бульвар Гавела 16)
UPDATE branches SET lat = 50.440263, lng = 30.405417 WHERE name ILIKE '%Центр%';

-- Оновлюємо філію Львів (Липинського 36)
UPDATE branches SET lat = 49.865445, lng = 24.041078 WHERE name ILIKE '%Захід%';

-- Оновлюємо філію Варшава
UPDATE branches SET lat = 52.229675, lng = 21.012230 WHERE name ILIKE '%Варшава%';

-- Оновлюємо філію Південь
UPDATE branches SET lat = 46.482526, lng = 30.723309 WHERE name ILIKE '%Південь%';
