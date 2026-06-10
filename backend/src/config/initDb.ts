import pool from './db';
import bcrypt from 'bcryptjs';

const createTablesQuery = `
  -- Create uuid-ossp/pgcrypto extensions if needed
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- 1. Cybers Table
  CREATE TABLE IF NOT EXISTS cybers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 2. Service Categories Table (NEW Phase 2)
  CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 3. Users Table (Staff only)
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_id UUID REFERENCES cybers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'attendant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 4. Services Table (UPDATED Phase 2 columns added dynamically)
  CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_id UUID REFERENCES cybers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- Safely add Phase 2 columns to services if they do not exist
  ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_upload BOOLEAN DEFAULT false;
  ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_physical_input BOOLEAN DEFAULT false;
  ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(50) DEFAULT 'fixed' CHECK (pricing_type IN ('per_page', 'fixed', 'per_item'));
  ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL;

  -- 5. Orders Table (Phase 2 backward compatible)
  CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    order_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'paid', 'processing', 'ready', 'completed')),
    special_instructions TEXT, -- NEW Phase 2 order metadata field
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 6. Order Items Table
  CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 7. Documents Table (Phase 1 legacy storage)
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL,
    pages INTEGER NOT NULL DEFAULT 1 CHECK (pages >= 0),
    color_pages INTEGER NOT NULL DEFAULT 0 CHECK (color_pages >= 0),
    bw_pages INTEGER NOT NULL DEFAULT 0 CHECK (bw_pages >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 8. Document Analysis Table (NEW Phase 2)
  CREATE TABLE IF NOT EXISTS document_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    total_pages INTEGER DEFAULT 1 CHECK (total_pages >= 0),
    color_pages INTEGER DEFAULT 0 CHECK (color_pages >= 0),
    bw_pages INTEGER DEFAULT 0 CHECK (bw_pages >= 0),
    file_type VARCHAR(100),
    analysis_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 9. Payments Table
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
  CREATE INDEX IF NOT EXISTS idx_doc_analysis_order ON document_analysis(order_id);
`;

export async function initDb() {
  console.log('Initializing database tables (including Phase 2 changes)...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(createTablesQuery);
    await client.query('COMMIT');
    console.log('Database tables verified/upgraded successfully.');

    // Seed Categories
    console.log('Checking and seeding Service Categories...');
    const categories = [
      { name: 'Document-Based Services', description: 'Requires uploading PDF, DOCX, or Image files for processing (e.g., printing, laminating).' },
      { name: 'Physical Document Services', description: 'Services involving walk-in physical papers brought by the customer (e.g., photocopying, physical scanning).' },
      { name: 'Digital Services', description: 'Assistance for online forms, project writings, and software applications (e.g., KRA registration, CV Writing).' },
    ];

    const categoryMap: { [key: string]: string } = {};

    for (const cat of categories) {
      const checkCat = await client.query('SELECT id FROM service_categories WHERE name = $1', [cat.name]);
      if (checkCat.rows.length === 0) {
        const insertCat = await client.query(
          'INSERT INTO service_categories (name, description) VALUES ($1, $2) RETURNING id',
          [cat.name, cat.description]
        );
        categoryMap[cat.name] = insertCat.rows[0].id;
      } else {
        categoryMap[cat.name] = checkCat.rows[0].id;
      }
    }

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

    // Seed default services for Phase 2 Workflows
    const serviceCheck = await client.query('SELECT COUNT(*) FROM services');
    const serviceCount = parseInt(serviceCheck.rows[0].count, 10);

    // If no services or only legacy ones, rebuild with clean Phase 2 intelligence
    if (serviceCount <= 6) {
      console.log('Updating & Seeding upgraded Phase 2 services...');
      
      // Delete legacy services to ensure clean categories and flags
      await client.query('DELETE FROM services');

      const phase2Services = [
        // A. DOCUMENT-BASED SERVICES (Requires upload)
        { 
          name: 'Black & White Printing (per page)', 
          price: 5.00, 
          requires_upload: true, 
          requires_physical_input: false, 
          pricing_type: 'per_page',
          categoryName: 'Document-Based Services'
        },
        { 
          name: 'Color Printing (per page)', 
          price: 20.00, 
          requires_upload: true, 
          requires_physical_input: false, 
          pricing_type: 'per_page',
          categoryName: 'Document-Based Services'
        },
        { 
          name: 'Document Scanning (per page)', 
          price: 10.00, 
          requires_upload: true, 
          requires_physical_input: false, 
          pricing_type: 'per_page',
          categoryName: 'Document-Based Services'
        },
        { 
          name: 'Document Photocopying (per page)', 
          price: 3.00, 
          requires_upload: true, 
          requires_physical_input: false, 
          pricing_type: 'per_page',
          categoryName: 'Document-Based Services'
        },
        { 
          name: 'Spiral Binding (After print)', 
          price: 50.00, 
          requires_upload: true, 
          requires_physical_input: true, // requires selecting quantity of bindings
          pricing_type: 'per_item',
          categoryName: 'Document-Based Services'
        },
        { 
          name: 'Lamination (After print)', 
          price: 100.00, 
          requires_upload: true, 
          requires_physical_input: true,
          pricing_type: 'per_item',
          categoryName: 'Document-Based Services'
        },

        // B. PHYSICAL DOCUMENT SERVICES (No upload)
        { 
          name: 'Photocopy (manual physical copy)', 
          price: 5.00, 
          requires_upload: false, 
          requires_physical_input: true, 
          pricing_type: 'per_page',
          categoryName: 'Physical Document Services'
        },
        { 
          name: 'Scanning (physical paper scan only)', 
          price: 10.00, 
          requires_upload: false, 
          requires_physical_input: true, 
          pricing_type: 'per_item',
          categoryName: 'Physical Document Services'
        },
        { 
          name: 'Passport Photo walk-in (Set of 4)', 
          price: 100.00, 
          requires_upload: false, 
          requires_physical_input: true, 
          pricing_type: 'fixed',
          categoryName: 'Physical Document Services'
        },
        { 
          name: 'eCitizen Services (per assistance)', 
          price: 150.00, 
          requires_upload: false, 
          requires_physical_input: false, 
          pricing_type: 'fixed',
          categoryName: 'Physical Document Services'
        },
        { 
          name: 'KRA PIN Registration', 
          price: 100.00, 
          requires_upload: false, 
          requires_physical_input: false, 
          pricing_type: 'fixed',
          categoryName: 'Physical Document Services'
        },

        // C. DIGITAL SERVICES (No documents)
        { 
          name: 'Professional CV Writing', 
          price: 250.00, 
          requires_upload: false, 
          requires_physical_input: false, 
          pricing_type: 'fixed',
          categoryName: 'Digital Services'
        },
        { 
          name: 'Job Online Application Assistance', 
          price: 100.00, 
          requires_upload: false, 
          requires_physical_input: false, 
          pricing_type: 'fixed',
          categoryName: 'Digital Services'
        },
        { 
          name: 'Email Creation & Setup', 
          price: 50.00, 
          requires_upload: false, 
          requires_physical_input: false, 
          pricing_type: 'fixed',
          categoryName: 'Digital Services'
        },
      ];

      for (const service of phase2Services) {
        const catId = categoryMap[service.categoryName];
        await client.query(
          `INSERT INTO services (cyber_id, name, price, requires_upload, requires_physical_input, pricing_type, category_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [cyberId, service.name, service.price, service.requires_upload, service.requires_physical_input, service.pricing_type, catId]
        );
      }
      console.log('Phase 2 services seeded successfully with relational structures!');
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
