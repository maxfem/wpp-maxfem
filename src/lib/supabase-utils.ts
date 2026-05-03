import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

/**
 * Fetch all rows from a Supabase query, bypassing the 1000-row limit.
 * Uses pagination internally to retrieve all matching records.
 */
export async function fetchAll<T>(query: PostgrestFilterBuilder<any, any, T[]>): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  let all: T[] = [];
  
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    
    if (error) {
      console.error("Error in fetchAll:", error);
      throw error;
    }
    
    if (!data || data.length === 0) break;
    
    all = all.concat(data);
    
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  
  return all;
}
