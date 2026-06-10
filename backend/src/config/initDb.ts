import pool from './db';
import bcrypt from 'bcryptjs';

const createTablesQuery = `
  -- Create uuid-ossp extension if gen_random_uuid is not enough (though gen_random_uuid is built-in)
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- 1. Cybers Table
  CREATE TABLE IF NOT EXISTS cybers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 2. Users Table (Staff only)
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_id UUID REFERENCES cybers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'attendant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 3. Services Table
  CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_id UUID REFERENCES cybers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 4. Orders Table
  CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    order_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'paid', 'processing', 'ready', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 5. Order Items Table
  CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 6. Documents Table
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL,
    pages INTEGER NOT NULL DEFAULT 1 CHECK (pages >= 0),
    color_pages INTEGER NOT NULL DEFAULT 0 CHECK (color_pages >= 0),
    bw_pages INTEGER NOT NULL DEFAULT 0 CHECK (bw_pages >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 7. Payments Table
  CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    mpesa_receipt VARCHAR(100) UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- Create Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_services_cyber ON services(cyber_id);
  CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
  CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_documents_order ON documents(order_id);
  CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`;

export async function initDb() {
  console.log('Initializing database tables...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(createTablesQuery);
    await client.query('COMMIT');
    console.log('Database tables created/verified successfully.');

    // Seed initial Cyber Cafe
    const cyberCheck = await client.query('SELECT * FROM cybers LIMIT 1');
    let cyberId: string;

    if (cyberCheck.rows.length === 0) {
      console.log('Seeding default Cyber Cafe...');
      const insertCyber = await client.query(
        `INSERT INTO cybers (name, location) VALUES ($1, $2) RETURNING id`,
        ['Mega Cyber Café', 'Nairobi CBD, Kenya']
      );
      cyberId = insertCyber.rows[0].id;
    } else {
      cyberId = cyberCheck.rows[0].id;
    }

    // Seed staff users
    const userCheck = await client.query('SELECT * FROM users LIMIT 1');
    if (userCheck.rows.length === 0) {
      console.log('Seeding default staff users...');
      const passwordHash = await bcrypt.hash('password123', 10);
      
      // Owner
      await client.query(
        `INSERT INTO users (cyber_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
        [cyberId, 'John Kamau (Owner)', 'owner@cyber.com', passwordHash, 'owner']
      );

      // Attendant
      await client.query(
        `INSERT INTO users (cyber_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
        [cyberId, 'Alice Wambui (Attendant)', 'attendant@cyber.com', passwordHash, 'attendant']
      );
      console.log('Default staff users seeded. (owner@cyber.com / attendant@cyber.com -> password123)');
    }

    // Seed default services
    const serviceCheck = await client.query('SELECT * FROM services LIMIT 1');
    if (serviceCheck.rows.length === 0) {
      console.log('Seeding default services...');
      const defaultServices = [
        { name: 'Black & White Printing (per page)', price: 5.00 },
        { name: 'Color Printing (per page)', price: 20.00 },
        { name: 'Document Scanning (per doc)', price: 10.00 },
        { name: 'Photocopying (per page)', price: 3.00 },
        { name: 'Spiral Binding', price: 50.00 },
        { name: 'Lamination (per page)', price: 100.00 },
      ];

      for (const service of defaultServices) {
        await client.query(
          `INSERT INTO services (cyber_id, name, price) VALUES ($1, $2, $3)`,
          [cyberId, service.name, service.price]
        );
      }
      console.log('Default services seeded successfully.');
    }

    console.log('Database seeding process completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Support running this script directly
if (require.main === module) {
  initDb()
    .then(() => {
      console.log('DB init script ran successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('DB init script failed:', err);
      process.exit(1);
    });
}
