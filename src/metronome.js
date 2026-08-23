import { renderAmbientBlobs } from './common.js'
import { supabase } from './lib/supabase.js'

// Initialize ambient background blobs
renderAmbientBlobs()

console.log('Guitar By Quang v2 - Metronome initialized with Supabase client:', Boolean(supabase))
