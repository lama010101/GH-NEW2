import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { roomCode } = body as { roomCode?: string }

    if (!roomCode || typeof roomCode !== 'string') {
      return NextResponse.json({ error: 'roomCode is required' }, { status: 400 })
    }

    const code = roomCode.trim().toUpperCase()

    const { data, error } = await supabase
      .from('sessions')
      .select('game_id')
      .eq('room_code', code)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    console.log('[JOIN_ROUTE] Resolved room code', code, '→ gameId:', data.game_id)
    return NextResponse.json({ gameId: data.game_id })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
