export type StoneCatalogItem = {
  id: number;
  name: string;
  polishType: string;
  available: boolean;
  color: string;
};

export const stonesCatalogData: StoneCatalogItem[] = [
  {
    id: 1,
    name: "גרניט שחור",
    polishType: "מבריק",
    available: true,
    color: "#171717",
  },
  {
    id: 2,
    name: "גרניט חום",
    polishType: "מט",
    available: true,
    color: "#78350f",
  },
  {
    id: 3,
    name: "גרניט אפור",
    polishType: "למינציה",
    available: true,
    color: "#57534e",
  },
  {
    id: 4,
    name: "גרניט כחול",
    polishType: "מוברש",
    available: true,
    color: "#1e3a8a",
  },
  {
    id: 5,
    name: "גרניט ירוק",
    polishType: "מבריק",
    available: true,
    color: "#166534",
  },
  {
    id: 6,
    name: "גרניט צהוב",
    polishType: "מט",
    available: true,
    color: "#ca8a04",
  },
  {
    id: 7,
    name: "גרניט אדום",
    polishType: "למינציה",
    available: true,
    color: "#b91c1c",
  },
  {
    id: 8,
    name: "גרניט צהוב",
    polishType: "מט",
    available: true,
    color: "#a16207",
  },
  {
    id: 9,
    name: "גרניט אדום",
    polishType: "למינציה",
    available: true,
    color: "#991b1b",
  },
];
