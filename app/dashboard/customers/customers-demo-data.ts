export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: "active" | "inactive" | "lead";
  city: string;
  totalOrders: number;
};

export const customersDemoData: Customer[] = [
  {
    id: "cust-001",
    name: "דני כהן",
    email: "danny.cohen@example.co.il",
    phone: "+972-52-111-2233",
    company: "כהן טקסטיל בע״מ",
    status: "active",
    city: "תל אביב",
    totalOrders: 42,
  },
  {
    id: "cust-002",
    name: "Sarah Miller",
    email: "sarah.m@fabric-imports.com",
    phone: "+1-415-555-0198",
    company: "Fabric Imports LLC",
    status: "active",
    city: "San Francisco",
    totalOrders: 128,
  },
  {
    id: "cust-003",
    name: "מיכל לוי",
    email: "michal.levi@gmail.com",
    phone: "+972-54-987-6543",
    company: "סטודיו לוי",
    status: "lead",
    city: "חיפה",
    totalOrders: 0,
  },
  {
    id: "cust-004",
    name: "James Okonkwo",
    email: "j.okonkwo@threads.global",
    phone: "+44-20-7946-0958",
    company: "Threads Global Ltd",
    status: "active",
    city: "London",
    totalOrders: 67,
  },
  {
    id: "cust-005",
    name: "נועה אברהם",
    email: "noa@avraham-design.co.il",
    phone: "+972-50-444-8899",
    company: "אברהם דיזיין",
    status: "inactive",
    city: "ירושלים",
    totalOrders: 15,
  },
  {
    id: "cust-006",
    name: "Elena Rossi",
    email: "e.rossi@moda-it.it",
    phone: "+39-02-555-0142",
    company: "Moda Italia SRL",
    status: "active",
    city: "Milan",
    totalOrders: 203,
  },
  {
    id: "cust-007",
    name: "יוסי גבאי",
    email: "yossi@gabay-retail.co.il",
    phone: "+972-52-300-7711",
    company: "גבאי ריטייל",
    status: "lead",
    city: "באר שבע",
    totalOrders: 2,
  },
  {
    id: "cust-008",
    name: "Priya Sharma",
    email: "priya@loomcraft.in",
    phone: "+91-22-5555-4411",
    company: "Loomcraft Pvt Ltd",
    status: "active",
    city: "Mumbai",
    totalOrders: 91,
  },
];
