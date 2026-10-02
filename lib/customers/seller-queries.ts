import "server-only";

import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { COUNTRY_NAMES, regionName, type CountryCode } from "@/lib/dashboard/regions";
import { customerHistory, dueCustomers, getCustomer, listCustomers, sellerPurchases, sellerStats } from "./seller-repo";
import { daysWithoutPurchase, dueTone, isDue } from "./seller-rules";
import { viewerOf } from "./seller-service";

type User = Pick<AdminUser, "role" | "salesPersonId">;
type Row = Awaited<ReturnType<typeof listCustomers>>[number];

export function toRow(customer: Row, today = new Date()) {
  return {
    id: customer.id, name: customer.name, phone: customer.phoneNormalized ?? customer.phone,
    region: customer.regionCode ? regionName(customer.regionCode).replace(/ viloyati$/, "") : COUNTRY_NAMES[customer.country as CountryCode] ?? customer.country,
    callIntervalDays: customer.callIntervalDays, days: daysWithoutPurchase(customer, today),
    due: isDue(customer, today) ? dueTone(customer, today) : null,
    nextContact: customer.nextContactAt?.toISOString() ?? null,
  };
}

export const myCustomers = (user: User) => listCustomers(getDb(), viewerOf(user));
export const myCustomer = (user: User, id: string) => getCustomer(getDb(), viewerOf(user), id);
export const myCustomerHistory = (user: User, id: string) => customerHistory(getDb(), viewerOf(user), id);
export const myStats = (user: User, year: number) => sellerStats(getDb(), viewerOf(user), year);
export const myDueCustomers = (user: User) => dueCustomers(getDb(), viewerOf(user));
export const myPurchases = (user: User) => sellerPurchases(getDb(), viewerOf(user));
