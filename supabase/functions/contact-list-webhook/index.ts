import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const listId = url.searchParams.get('list_id')

    if (!listId) {
      return new Response(JSON.stringify({ error: 'Missing list_id parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get list info to find tenant_id
    const { data: list, error: listError } = await supabase
      .from('contact_lists')
      .select('tenant_id, name')
      .eq('id', listId)
      .single()

    if (listError || !list) {
      console.error('List not found:', listError)
      return new Response(JSON.stringify({ error: 'List not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    console.log(`Received webhook for list "${list.name}" (${listId}):`, body)

    const { name, email, phone, document, tags, custom_attributes } = body

    if (!email && !phone) {
      return new Response(JSON.stringify({ error: 'Email or phone is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Find or create customer
    let customerId;
    
    // Try find by email
    if (email) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', list.tenant_id)
        .eq('email', email)
        .maybeSingle()
      
      if (existing) customerId = existing.id;
    }

    // Try find by phone if not found by email
    if (!customerId && phone) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', list.tenant_id)
        .eq('phone', phone)
        .maybeSingle()
      
      if (existing) customerId = existing.id;
    }

    if (!customerId) {
      console.log('Creating new customer...')
      const { data: created, error: createError } = await supabase
        .from('customers')
        .insert({
          tenant_id: list.tenant_id,
          name: name || 'Novo Contato',
          email,
          phone,
          document,
          tags,
          custom_attributes,
          is_lead: true
        })
        .select('id')
        .single()
      
      if (createError) {
        console.error('Error creating customer:', createError)
        throw createError
      }
      customerId = created.id
    } else {
      // Update existing customer info if provided
      const updateData: any = {}
      if (name) updateData.name = name
      if (document) updateData.document = document
      if (tags) updateData.tags = tags
      if (custom_attributes) updateData.custom_attributes = custom_attributes

      if (Object.keys(updateData).length > 0) {
        await supabase.from('customers').update(updateData).eq('id', customerId)
      }
    }

    // 3. Add to list
    const { error: memberError } = await supabase
      .from('contact_list_members')
      .upsert({
        list_id: listId,
        customer_id: customerId,
        added_at: new Date().toISOString()
      }, {
        onConflict: 'list_id,customer_id'
      })

    if (memberError) {
      console.error('Error adding member to list:', memberError)
      throw memberError
    }

    return new Response(JSON.stringify({ 
      success: true, 
      customer_id: customerId,
      message: 'Contact added to list successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
