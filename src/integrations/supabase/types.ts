export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_bootstrap_state: {
        Row: {
          claimed: boolean
          id: number
        }
        Insert: {
          claimed?: boolean
          id?: number
        }
        Update: {
          claimed?: boolean
          id?: number
        }
        Relationships: []
      }
      army_lists: {
        Row: {
          army_faction: string | null
          created_at: string
          formations: Json
          game_system: string
          gamemode: string
          id: string
          list_format: string
          mode: string
          name: string
          points: number
          roster: Json
          slots: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          army_faction?: string | null
          created_at?: string
          formations?: Json
          game_system?: string
          gamemode?: string
          id?: string
          list_format?: string
          mode?: string
          name: string
          points?: number
          roster?: Json
          slots?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          army_faction?: string | null
          created_at?: string
          formations?: Json
          game_system?: string
          gamemode?: string
          id?: string
          list_format?: string
          mode?: string
          name?: string
          points?: number
          roster?: Json
          slots?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      battle_records: {
        Row: {
          conquest: boolean
          created_at: string
          engines_destroyed: number
          game_id: string
          models_lost: number
          mvp: string | null
          points: number
          result: string
          user_id: string
          vp_against: number
          vp_for: number
        }
        Insert: {
          conquest?: boolean
          created_at?: string
          engines_destroyed?: number
          game_id: string
          models_lost?: number
          mvp?: string | null
          points?: number
          result: string
          user_id: string
          vp_against?: number
          vp_for?: number
        }
        Update: {
          conquest?: boolean
          created_at?: string
          engines_destroyed?: number
          game_id?: string
          models_lost?: number
          mvp?: string | null
          points?: number
          result?: string
          user_id?: string
          vp_against?: number
          vp_for?: number
        }
        Relationships: []
      }
      build_queue: {
        Row: {
          cost: number
          created_at: string
          duration_seconds: number | null
          finishes_at: string | null
          id: string
          kind: string
          module: string
          repair_amount: number
          sequence: number
          started_at: string | null
          target_level: number
          user_id: string
        }
        Insert: {
          cost: number
          created_at?: string
          duration_seconds?: number | null
          finishes_at?: string | null
          id?: string
          kind?: string
          module: string
          repair_amount?: number
          sequence?: never
          started_at?: string | null
          target_level: number
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          duration_seconds?: number | null
          finishes_at?: string | null
          id?: string
          kind?: string
          module?: string
          repair_amount?: number
          sequence?: never
          started_at?: string | null
          target_level?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_queue_module_fkey"
            columns: ["module"]
            isOneToOne: false
            referencedRelation: "module_types"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign: {
        Row: {
          id: number
          number: number
          phase: string
          reward_capture: number
          reward_loss: number
          reward_neutral: number
          reward_win: number
          started_at: string | null
        }
        Insert: {
          id?: number
          number?: number
          phase?: string
          reward_capture?: number
          reward_loss?: number
          reward_neutral?: number
          reward_win?: number
          started_at?: string | null
        }
        Update: {
          id?: number
          number?: number
          phase?: string
          reward_capture?: number
          reward_loss?: number
          reward_neutral?: number
          reward_win?: number
          started_at?: string | null
        }
        Relationships: []
      }
      celestial_bodies: {
        Row: {
          biome: string
          id: string
          kind: string
          name: string
          orbit: number
          parent_id: string | null
          playable: boolean
          sort: number
          status: string
        }
        Insert: {
          biome: string
          id: string
          kind?: string
          name: string
          orbit: number
          parent_id?: string | null
          playable?: boolean
          sort?: number
          status?: string
        }
        Update: {
          biome?: string
          id?: string
          kind?: string
          name?: string
          orbit?: number
          parent_id?: string | null
          playable?: boolean
          sort?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "celestial_bodies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "celestial_bodies"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          quantity: number
          unit_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          quantity?: number
          unit_id: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          quantity?: number
          unit_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      engine_damage: {
        Row: {
          created_at: string
          id: string
          max_wounds: number
          name: string
          repair_until: string | null
          unit_id: number
          user_id: string
          veteran_id: string | null
          wounds_lost: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_wounds: number
          name?: string
          repair_until?: string | null
          unit_id: number
          user_id: string
          veteran_id?: string | null
          wounds_lost: number
        }
        Update: {
          created_at?: string
          id?: string
          max_wounds?: number
          name?: string
          repair_until?: string | null
          unit_id?: number
          user_id?: string
          veteran_id?: string | null
          wounds_lost?: number
        }
        Relationships: []
      }
      game_exclusions: {
        Row: {
          game_id: string
          user_id: string
        }
        Insert: {
          game_id: string
          user_id: string
        }
        Update: {
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_exclusions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          accepted_at: string | null
          battle: Json
          battle_type: string
          created_at: string
          creator_ally_id: string | null
          creator_ally_list_id: string | null
          creator_id: string
          creator_list_id: string | null
          format: string
          id: string
          notes: string
          opponent_ally_id: string | null
          opponent_ally_list_id: string | null
          opponent_id: string | null
          opponent_list_id: string | null
          points: number
          region_id: number | null
          scenario_id: string | null
          scenario_random: boolean
          scheduled_at: string | null
          size: string
          started_at: string | null
          status: string
          summaries: Json
        }
        Insert: {
          accepted_at?: string | null
          battle?: Json
          battle_type?: string
          created_at?: string
          creator_ally_id?: string | null
          creator_ally_list_id?: string | null
          creator_id?: string
          creator_list_id?: string | null
          format?: string
          id?: string
          notes?: string
          opponent_ally_id?: string | null
          opponent_ally_list_id?: string | null
          opponent_id?: string | null
          opponent_list_id?: string | null
          points: number
          region_id?: number | null
          scenario_id?: string | null
          scenario_random?: boolean
          scheduled_at?: string | null
          size: string
          started_at?: string | null
          status?: string
          summaries?: Json
        }
        Update: {
          accepted_at?: string | null
          battle?: Json
          battle_type?: string
          created_at?: string
          creator_ally_id?: string | null
          creator_ally_list_id?: string | null
          creator_id?: string
          creator_list_id?: string | null
          format?: string
          id?: string
          notes?: string
          opponent_ally_id?: string | null
          opponent_ally_list_id?: string | null
          opponent_id?: string | null
          opponent_list_id?: string | null
          points?: number
          region_id?: number | null
          scenario_id?: string | null
          scenario_random?: boolean
          scheduled_at?: string | null
          size?: string
          started_at?: string | null
          status?: string
          summaries?: Json
        }
        Relationships: [
          {
            foreignKeyName: "games_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      honours: {
        Row: {
          ability: string
          bearer: string
          created_at: string
          id: string
          unit_id: number
          used_at: string | null
          used_game: string | null
          user_id: string
          veteran_id: string | null
        }
        Insert: {
          ability: string
          bearer?: string
          created_at?: string
          id?: string
          unit_id: number
          used_at?: string | null
          used_game?: string | null
          user_id: string
          veteran_id?: string | null
        }
        Update: {
          ability?: string
          bearer?: string
          created_at?: string
          id?: string
          unit_id?: number
          used_at?: string | null
          used_game?: string | null
          user_id?: string
          veteran_id?: string | null
        }
        Relationships: []
      }
      lost_engines: {
        Row: {
          game_id: string | null
          id: string
          lost_at: string
          name: string
          unit_id: number
          user_id: string
          veteran_id: string | null
        }
        Insert: {
          game_id?: string | null
          id?: string
          lost_at?: string
          name?: string
          unit_id: number
          user_id: string
          veteran_id?: string | null
        }
        Update: {
          game_id?: string | null
          id?: string
          lost_at?: string
          name?: string
          unit_id?: number
          user_id?: string
          veteran_id?: string | null
        }
        Relationships: []
      }
      module_types: {
        Row: {
          active: boolean
          base_cost: number
          base_hours: number
          description: string
          id: string
          max_level: number
          name: string
          sort: number
        }
        Insert: {
          active?: boolean
          base_cost: number
          base_hours: number
          description?: string
          id: string
          max_level?: number
          name: string
          sort?: number
        }
        Update: {
          active?: boolean
          base_cost?: number
          base_hours?: number
          description?: string
          id?: string
          max_level?: number
          name?: string
          sort?: number
        }
        Relationships: []
      }
      naval_private_plans: {
        Row: {
          attacker_plan: Json
          defender_plan: Json | null
          raid_id: string
        }
        Insert: {
          attacker_plan?: Json
          defender_plan?: Json | null
          raid_id: string
        }
        Update: {
          attacker_plan?: Json
          defender_plan?: Json | null
          raid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "naval_private_plans_raid_id_fkey"
            columns: ["raid_id"]
            isOneToOne: true
            referencedRelation: "naval_raids"
            referencedColumns: ["id"]
          },
        ]
      }
      naval_raids: {
        Row: {
          attacker_id: string
          attacker_plan: Json
          attacker_ready: boolean
          block_number: number
          created_at: string
          deadline: string
          defender_id: string
          defender_plan: Json | null
          defender_ready: boolean
          id: string
          loot: number
          report: Json
          resolved_at: string | null
          status: string
          winner: string | null
        }
        Insert: {
          attacker_id: string
          attacker_plan?: Json
          attacker_ready?: boolean
          block_number?: number
          created_at?: string
          deadline: string
          defender_id: string
          defender_plan?: Json | null
          defender_ready?: boolean
          id?: string
          loot?: number
          report?: Json
          resolved_at?: string | null
          status?: string
          winner?: string | null
        }
        Update: {
          attacker_id?: string
          attacker_plan?: Json
          attacker_ready?: boolean
          block_number?: number
          created_at?: string
          deadline?: string
          defender_id?: string
          defender_plan?: Json | null
          defender_ready?: boolean
          id?: string
          loot?: number
          report?: Json
          resolved_at?: string | null
          status?: string
          winner?: string | null
        }
        Relationships: []
      }
      naval_stances: {
        Row: {
          plan: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          plan?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          plan?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pod_bay: {
        Row: {
          quantity: number
          unit_id: number
          user_id: string
        }
        Insert: {
          quantity?: number
          unit_id: number
          user_id: string
        }
        Update: {
          quantity?: number
          unit_id?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allegiance: Database["public"]["Enums"]["allegiance"] | null
          approved: boolean
          army_faction: string | null
          army_race: string | null
          army_variant: string | null
          created_at: string
          email: string | null
          faction: string | null
          force_name: string | null
          forge_gift_claimed: boolean
          id: string
          imperial_credits: number
          leader_name: string | null
          legion: string | null
          map_color: string
          map_emblem: string
          oath_sworn_at: string | null
          portrait_path: string | null
          previous_allegiance: Database["public"]["Enums"]["allegiance"] | null
          renown: number
          updated_at: string
        }
        Insert: {
          allegiance?: Database["public"]["Enums"]["allegiance"] | null
          approved?: boolean
          army_faction?: string | null
          army_race?: string | null
          army_variant?: string | null
          created_at?: string
          email?: string | null
          faction?: string | null
          force_name?: string | null
          forge_gift_claimed?: boolean
          id: string
          imperial_credits?: number
          leader_name?: string | null
          legion?: string | null
          map_color?: string
          map_emblem?: string
          oath_sworn_at?: string | null
          portrait_path?: string | null
          previous_allegiance?: Database["public"]["Enums"]["allegiance"] | null
          renown?: number
          updated_at?: string
        }
        Update: {
          allegiance?: Database["public"]["Enums"]["allegiance"] | null
          approved?: boolean
          army_faction?: string | null
          army_race?: string | null
          army_variant?: string | null
          created_at?: string
          email?: string | null
          faction?: string | null
          force_name?: string | null
          forge_gift_claimed?: boolean
          id?: string
          imperial_credits?: number
          leader_name?: string | null
          legion?: string | null
          map_color?: string
          map_emblem?: string
          oath_sworn_at?: string | null
          portrait_path?: string | null
          previous_allegiance?: Database["public"]["Enums"]["allegiance"] | null
          renown?: number
          updated_at?: string
        }
        Relationships: []
      }
      recruit_orders: {
        Row: {
          cost: number
          created_at: string
          id: string
          quantity: number
          ready_at: string
          unit_id: number
          user_id: string
        }
        Insert: {
          cost: number
          created_at?: string
          id?: string
          quantity: number
          ready_at: string
          unit_id: number
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          quantity?: number
          ready_at?: string
          unit_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruit_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit_catalog"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      region_attacks: {
        Row: {
          attacker_id: string
          auto_attacker_confirmed: boolean
          auto_defender_confirmed: boolean
          created_at: string
          deadline: string
          defender_id: string | null
          game_id: string | null
          id: string
          kind: string
          region_id: number
          resolved_at: string | null
          result: string | null
          summaries: Json
        }
        Insert: {
          attacker_id: string
          auto_attacker_confirmed?: boolean
          auto_defender_confirmed?: boolean
          created_at?: string
          deadline: string
          defender_id?: string | null
          game_id?: string | null
          id?: string
          kind: string
          region_id: number
          resolved_at?: string | null
          result?: string | null
          summaries?: Json
        }
        Update: {
          attacker_id?: string
          auto_attacker_confirmed?: boolean
          auto_defender_confirmed?: boolean
          created_at?: string
          deadline?: string
          defender_id?: string | null
          game_id?: string | null
          id?: string
          kind?: string
          region_id?: number
          resolved_at?: string | null
          result?: string | null
          summaries?: Json
        }
        Relationships: [
          {
            foreignKeyName: "region_attacks_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          body_id: string
          continent: number
          id: number
          is_spaceport: boolean
          name: string
          neighbors: number[]
          owned_since: string | null
          owner_id: string | null
          scenario_id: string | null
          type: string
        }
        Insert: {
          body_id?: string
          continent?: number
          id: number
          is_spaceport?: boolean
          name: string
          neighbors?: number[]
          owned_since?: string | null
          owner_id?: string | null
          scenario_id?: string | null
          type?: string
        }
        Update: {
          body_id?: string
          continent?: number
          id?: number
          is_spaceport?: boolean
          name?: string
          neighbors?: number[]
          owned_since?: string | null
          owner_id?: string | null
          scenario_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_body_id_fkey"
            columns: ["body_id"]
            isOneToOne: false
            referencedRelation: "celestial_bodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      ship_modules: {
        Row: {
          building_until: string | null
          damaged: boolean
          damaged_until: string | null
          level: number
          module: string
          user_id: string
        }
        Insert: {
          building_until?: string | null
          damaged?: boolean
          damaged_until?: string | null
          level?: number
          module: string
          user_id: string
        }
        Update: {
          building_until?: string | null
          damaged?: boolean
          damaged_until?: string | null
          level?: number
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ship_modules_module_fkey"
            columns: ["module"]
            isOneToOne: false
            referencedRelation: "module_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ship_supports: {
        Row: {
          orbital_charged: boolean
          orbital_ready_at: string | null
          pods: number
          pods_building: number
          pods_ready_at: string | null
          user_id: string
        }
        Insert: {
          orbital_charged?: boolean
          orbital_ready_at?: string | null
          pods?: number
          pods_building?: number
          pods_ready_at?: string | null
          user_id: string
        }
        Update: {
          orbital_charged?: boolean
          orbital_ready_at?: string | null
          pods?: number
          pods_building?: number
          pods_ready_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ship_travel_private: {
        Row: {
          destination: string
          started_at: string
          user_id: string
        }
        Insert: {
          destination: string
          started_at?: string
          user_id: string
        }
        Update: {
          destination?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ship_travel_private_destination_fkey"
            columns: ["destination"]
            isOneToOne: false
            referencedRelation: "celestial_bodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ship_travel_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "ships"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ships: {
        Row: {
          arrives_at: string | null
          body_id: string | null
          created_at: string
          hull_hp: number | null
          hull_repair_target: number | null
          hull_repair_until: string | null
          last_income_at: string
          name: string
          region: string
          travel_from: string | null
          user_id: string
        }
        Insert: {
          arrives_at?: string | null
          body_id?: string | null
          created_at?: string
          hull_hp?: number | null
          hull_repair_target?: number | null
          hull_repair_until?: string | null
          last_income_at?: string
          name: string
          region?: string
          travel_from?: string | null
          user_id?: string
        }
        Update: {
          arrives_at?: string | null
          body_id?: string | null
          created_at?: string
          hull_hp?: number | null
          hull_repair_target?: number | null
          hull_repair_until?: string | null
          last_income_at?: string
          name?: string
          region?: string
          travel_from?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ships_body_id_fkey"
            columns: ["body_id"]
            isOneToOne: false
            referencedRelation: "celestial_bodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ships_travel_from_fkey"
            columns: ["travel_from"]
            isOneToOne: false
            referencedRelation: "celestial_bodies"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_catalog: {
        Row: {
          category: string
          cost: number
          hours: number
          name: string
          unit_id: number
        }
        Insert: {
          category: string
          cost: number
          hours: number
          name: string
          unit_id: number
        }
        Update: {
          category?: string
          cost?: number
          hours?: number
          name?: string
          unit_id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      veteran_battles: {
        Row: {
          created_at: string
          destroyed: boolean
          game_id: string | null
          honour: string | null
          id: string
          mvp: boolean
          renown_gained: number
          result: string
          veteran_id: string
          wounds_lost: number
        }
        Insert: {
          created_at?: string
          destroyed?: boolean
          game_id?: string | null
          honour?: string | null
          id?: string
          mvp?: boolean
          renown_gained?: number
          result: string
          veteran_id: string
          wounds_lost?: number
        }
        Update: {
          created_at?: string
          destroyed?: boolean
          game_id?: string | null
          honour?: string | null
          id?: string
          mvp?: boolean
          renown_gained?: number
          result?: string
          veteran_id?: string
          wounds_lost?: number
        }
        Relationships: [
          {
            foreignKeyName: "veteran_battles_veteran_id_fkey"
            columns: ["veteran_id"]
            isOneToOne: false
            referencedRelation: "veterans"
            referencedColumns: ["id"]
          },
        ]
      }
      veterans: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          renown: number
          status: string
          unit_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name?: string
          renown?: number
          status?: string
          unit_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          renown?: number
          status?: string
          unit_id?: number
          user_id?: string
        }
        Relationships: []
      }
      wh40k_recruits: {
        Row: {
          faction: string
          models: number
          quantity: number
          unit_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          faction: string
          models: number
          quantity?: number
          unit_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          faction?: string
          models?: number
          quantity?: number
          unit_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wh40k_squad_history: {
        Row: {
          cost: number
          created_at: string
          game_id: string | null
          id: string
          kind: string
          models_lost: number
          note: string
          squad_id: string
          user_id: string
          wounds_lost: number
        }
        Insert: {
          cost?: number
          created_at?: string
          game_id?: string | null
          id?: string
          kind: string
          models_lost?: number
          note?: string
          squad_id: string
          user_id: string
          wounds_lost?: number
        }
        Update: {
          cost?: number
          created_at?: string
          game_id?: string | null
          id?: string
          kind?: string
          models_lost?: number
          note?: string
          squad_id?: string
          user_id?: string
          wounds_lost?: number
        }
        Relationships: []
      }
      wh40k_squads: {
        Row: {
          created_at: string
          faction: string
          fallen_at: string | null
          id: string
          loadout: Json
          models: number
          models_alive: number
          nickname: string
          oc_cost: number | null
          photo_path: string | null
          points: number
          ready_at: string | null
          status: string
          unit_name: string
          user_id: string
          wounds_left: number | null
          wounds_max: number | null
        }
        Insert: {
          created_at?: string
          faction: string
          fallen_at?: string | null
          id?: string
          loadout?: Json
          models: number
          models_alive: number
          nickname?: string
          oc_cost?: number | null
          photo_path?: string | null
          points?: number
          ready_at?: string | null
          status?: string
          unit_name: string
          user_id: string
          wounds_left?: number | null
          wounds_max?: number | null
        }
        Update: {
          created_at?: string
          faction?: string
          fallen_at?: string | null
          id?: string
          loadout?: Json
          models?: number
          models_alive?: number
          nickname?: string
          oc_cost?: number | null
          photo_path?: string | null
          points?: number
          ready_at?: string | null
          status?: string
          unit_name?: string
          user_id?: string
          wounds_left?: number | null
          wounds_max?: number | null
        }
        Relationships: []
      }
      wh40k_unit_prices: {
        Row: {
          epic_hero: boolean
          faction: string
          models: number
          oc_per_model: number | null
          points: number
          unit_name: string
          wounds: number | null
        }
        Insert: {
          epic_hero?: boolean
          faction: string
          models: number
          oc_per_model?: number | null
          points: number
          unit_name: string
          wounds?: number | null
        }
        Update: {
          epic_hero?: boolean
          faction?: string
          models?: number
          oc_per_model?: number | null
          points?: number
          unit_name?: string
          wounds?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      achievement_stats: {
        Args: never
        Returns: {
          allegiance: Database["public"]["Enums"]["allegiance"]
          battles: number
          best_margin: number
          big_battles: number
          conquest_wins: number
          draws: number
          engines_destroyed: number
          faction: string
          honours_used: number
          id: string
          leader_name: string
          legion: string
          losses: number
          map_color: string
          map_emblem: string
          regions: number
          renown: number
          spaceport: boolean
          wins: number
        }[]
      }
      admin_adjust: {
        Args: { _credits: number; _renown: number; _uid: string }
        Returns: undefined
      }
      admin_cancel_raid: { Args: { _id: string }; Returns: undefined }
      admin_clear_damage: {
        Args: { _id: string; _restore_lost: boolean }
        Returns: undefined
      }
      admin_finish_travel: { Args: { _uid?: string }; Returns: number }
      admin_force_queues: { Args: { _uid: string }; Returns: undefined }
      admin_force_region: {
        Args: { _region: number; _spaceport: boolean; _uid: string }
        Returns: undefined
      }
      admin_games: {
        Args: never
        Returns: {
          accepted_at: string | null
          battle: Json
          battle_type: string
          created_at: string
          creator_ally_id: string | null
          creator_ally_list_id: string | null
          creator_id: string
          creator_list_id: string | null
          format: string
          id: string
          notes: string
          opponent_ally_id: string | null
          opponent_ally_list_id: string | null
          opponent_id: string | null
          opponent_list_id: string | null
          points: number
          region_id: number | null
          scenario_id: string | null
          scenario_random: boolean
          scheduled_at: string | null
          size: string
          started_at: string | null
          status: string
          summaries: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_grant_honour: {
        Args: { _ability: string; _bearer: string; _uid: string; _unit: number }
        Returns: undefined
      }
      admin_import_unit_oc: { Args: { _rows: Json }; Returns: number }
      admin_remove_honour: {
        Args: { _id: string; _restore: boolean }
        Returns: undefined
      }
      admin_repair_module: {
        Args: { _module: string; _uid: string }
        Returns: undefined
      }
      admin_reset_campaign: { Args: never; Returns: undefined }
      admin_resolve_attack: {
        Args: { _id: string; _winner: string }
        Returns: undefined
      }
      admin_resolve_battle: {
        Args: { _action: string; _battle?: Json; _game: string }
        Returns: undefined
      }
      admin_restart_campaign_safe: { Args: never; Returns: undefined }
      admin_set_body_status: {
        Args: { _body: string; _status: string }
        Returns: undefined
      }
      admin_set_phase: { Args: { _phase: string }; Returns: undefined }
      admin_set_supports: {
        Args: { _charged: boolean; _pods: number; _uid: string }
        Returns: undefined
      }
      admin_set_unit: {
        Args: { _qty: number; _uid: string; _unit: number }
        Returns: undefined
      }
      admin_skip_waits: {
        Args: { _include_attacks?: boolean; _uid: string }
        Returns: undefined
      }
      apply_casualties: {
        Args: { _c: Json; _game: string; _uid: string }
        Returns: undefined
      }
      build_module: { Args: { _module: string }; Returns: undefined }
      build_pods: { Args: { _qty: number }; Returns: undefined }
      campaign_players: {
        Args: never
        Returns: {
          allegiance: Database["public"]["Enums"]["allegiance"]
          force_name: string
          id: string
          leader_name: string
          map_color: string
          map_emblem: string
        }[]
      }
      campaign_players_40k: {
        Args: never
        Returns: {
          army_faction: string
          force_name: string
          id: string
          leader_name: string
          map_color: string
          map_emblem: string
        }[]
      }
      campaign_tick: { Args: never; Returns: undefined }
      cancel_campaign_operation: {
        Args: { _attack: string }
        Returns: undefined
      }
      cancel_claim: { Args: never; Returns: undefined }
      cancel_queued: { Args: { _id: string }; Returns: undefined }
      cancel_raid: { Args: { _id: string }; Returns: string }
      cancel_recruit: { Args: { _id: string }; Returns: undefined }
      claim_region: {
        Args: { _region: number; _size?: string }
        Returns: undefined
      }
      collect_daily_income: { Args: never; Returns: number }
      confirm_attack_auto_resolution: {
        Args: { _attack: string; _confirm?: boolean }
        Returns: string
      }
      create_ship: { Args: { _name: string }; Returns: undefined }
      income_breakdown: { Args: never; Returns: Json }
      daily_income_status: {
        Args: never
        Returns: {
          amount: number
          next_collection_at: string
          server_now: string
        }[]
      }
      declare_raid: {
        Args: { _defender: string; _plan: Json }
        Returns: string
      }
      delete_game: { Args: { _game: string }; Returns: undefined }
      demolish_module: { Args: { _module: string }; Returns: number }
      dismiss_40k: {
        Args: { _models: number; _qty: number; _unit: string }
        Returns: undefined
      }
      dismiss_unit: {
        Args: { _qty: number; _unit: number }
        Returns: undefined
      }
      dismiss_unit_and_veterans: {
        Args: { _qty: number; _unit: number }
        Returns: undefined
      }
      dup_advantage: { Args: { _uid: string }; Returns: number }
      faction_hold_factor: { Args: { _faction: string }; Returns: number }
      game_full: {
        Args: { g: Database["public"]["Tables"]["games"]["Row"] }
        Returns: boolean
      }
      game_lists: {
        Args: { _game: string }
        Returns: {
          formations: Json
          id: string
          name: string
          owner_id: string
          side: string
        }[]
      }
      get_supports: {
        Args: never
        Returns: {
          orbital_charged: boolean
          orbital_ready_at: string | null
          pods: number
          pods_building: number
          pods_ready_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ship_supports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      give_region: {
        Args: { _region: number; _reward: number; _uid: string }
        Returns: undefined
      }
      grant_honour: {
        Args: { _ability: string; _bearer: string; _unit: number }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      honour_cost: { Args: { _ability: string }; Returns: number }
      is_excluded: { Args: { _game: string; _user: string }; Returns: boolean }
      is_game_creator: {
        Args: { _game: string; _user: string }
        Returns: boolean
      }
      is_game_player: {
        Args: { _game: string; _user: string }
        Returns: boolean
      }
      join_game: {
        Args: { _game: string; _list: string; _side: string }
        Returns: undefined
      }
      land_region: { Args: { _region: number }; Returns: undefined }
      leave_game: { Args: { _game: string }; Returns: undefined }
      list_40k_playable: { Args: { _list: string }; Returns: boolean }
      list_players: {
        Args: never
        Returns: {
          allegiance: Database["public"]["Enums"]["allegiance"]
          force_name: string
          id: string
          leader_name: string
        }[]
      }
      load_pod_unit: {
        Args: { _qty: number; _unit: number }
        Returns: undefined
      }
      load_pods: { Args: { _qty: number }; Returns: undefined }
      mod_level: { Args: { _m: string; _uid: string }; Returns: number }
      naval_apply_crits: { Args: { _n: number; _uid: string }; Returns: Json }
      naval_beats: { Args: { _a: string; _b: string }; Returns: boolean }
      naval_continue: {
        Args: { _plan: Json; _raid: string }
        Returns: undefined
      }
      naval_finish: {
        Args: { _id: string; _reason: string; _winner: string }
        Returns: undefined
      }
      naval_normal_plan: { Args: { _p: Json; _uid: string }; Returns: Json }
      naval_order_module: { Args: { _o: string }; Returns: string }
      naval_plan_valid: { Args: { _p: Json; _uid: string }; Returns: boolean }
      naval_raids_view: { Args: never; Returns: Json }
      naval_roll: {
        Args: { _n: number; _target: number }
        Returns: Record<string, unknown>
      }
      naval_stats: {
        Args: never
        Returns: {
          defenses_won: number
          id: string
          loot: number
          raids_won: number
        }[]
      }
      naval_valid_plan: { Args: { _p: Json }; Returns: boolean }
      naval_withdraw: { Args: { _raid: string }; Returns: undefined }
      pod_capacity: { Args: { _lvl: number }; Returns: number }
      process_veterans: {
        Args: { _game: string; _res: string; _uid: string; _v: Json }
        Returns: undefined
      }
      recharge_orbital: { Args: never; Returns: undefined }
      recover_engine: { Args: { _id: string }; Returns: undefined }
      recruit_40k: {
        Args: { _models: number; _qty: number; _unit: string }
        Returns: number
      }
      recruit_unit: {
        Args: { _qty: number; _unit: number }
        Returns: undefined
      }
      region_rate: { Args: { _type: string; _uid: string }; Returns: number }
      region_types_of: { Args: { _uid: string }; Returns: string[] }
      rename_ship: { Args: { _name: string }; Returns: undefined }
      rename_veteran: {
        Args: { _id: string; _name: string }
        Returns: undefined
      }
      repair_engine: { Args: { _id: string }; Returns: undefined }
      repair_hull: { Args: never; Returns: undefined }
      repair_module: { Args: { _module: string }; Returns: undefined }
      reset_profile: { Args: never; Returns: undefined }
      resolve_raid: { Args: { _id: string }; Returns: undefined }
      resolve_raids: { Args: never; Returns: undefined }
      respond_game: {
        Args: { _accept: boolean; _game: string; _list?: string }
        Returns: undefined
      }
      save_battle: {
        Args: { _battle: Json; _game: string; _status: string }
        Returns: undefined
      }
      set_approval: {
        Args: { _approved: boolean; _user: string }
        Returns: undefined
      }
      set_default_stance: { Args: { _plan: Json }; Returns: undefined }
      set_raid_plan: {
        Args: { _plan: Json; _raid: string }
        Returns: undefined
      }
      ship_abort_course: { Args: never; Returns: string }
      ship_assert_capacity: {
        Args: { _oc: number; _uid: string }
        Returns: undefined
      }
      ship_assert_job_slot: { Args: never; Returns: undefined }
      ship_base_hull: { Args: { _uid: string }; Returns: number }
      ship_busy: { Args: { _uid: string }; Returns: boolean }
      ship_capacity: { Args: { _uid: string }; Returns: number }
      ship_fleet: { Args: { _uid: string }; Returns: string }
      ship_max_hull: { Args: { _uid: string }; Returns: number }
      ship_oc_used: { Args: { _uid: string }; Returns: number }
      ship_process_jobs: { Args: { _uid: string }; Returns: undefined }
      ship_set_course: { Args: { _body: string }; Returns: string }
      ship_start_queued: { Args: { _uid: string }; Returns: undefined }
      ship_start_queued_at: {
        Args: { _at: string; _uid: string }
        Returns: undefined
      }
      ship_status: { Args: never; Returns: Json }
      ship_tick: { Args: never; Returns: undefined }
      ship_training_seconds: {
        Args: { _points: number; _uid: string }
        Returns: number
      }
      ship_travel_tick: { Args: never; Returns: undefined }
      ship_warp_until: { Args: { _uid: string }; Returns: string }
      strategos: {
        Args: never
        Returns: {
          allegiance: Database["public"]["Enums"]["allegiance"]
          battles: number
          draws: number
          faction: string
          force_name: string
          id: string
          leader_name: string
          legion: string
          losses: number
          map_color: string
          map_emblem: string
          portrait_path: string
          regions: number
          renown: number
          spaceport: string
          wins: number
        }[]
      }
      support_tick: { Args: { _uid: string }; Returns: undefined }
      sync_my_veterans: { Args: never; Returns: undefined }
      sync_veterans: { Args: { _uid: string }; Returns: undefined }
      system_ships: {
        Args: never
        Returns: {
          army_faction: string
          arrives_at: string
          body_id: string
          destination: string
          leader_name: string
          map_color: string
          map_emblem: string
          name: string
          travel_from: string
          user_id: string
        }[]
      }
      travel_seconds: { Args: { _a: string; _b: string }; Returns: number }
      travel_seconds_for: { Args: { _uid: string; _a: string; _b: string }; Returns: number }
      use_honour: { Args: { _game: string; _id: string }; Returns: undefined }
      use_support: {
        Args: { _game: string; _kind: string }
        Returns: undefined
      }
      veteran_kind: { Args: { _unit: number }; Returns: string }
      wh40k_apply_result: { Args: { _game: string }; Returns: undefined }
      wh40k_attack_region: {
        Args: { _kind: string; _list: string; _points: number; _region: number }
        Returns: string
      }
      wh40k_battle_ready: { Args: { _game: string }; Returns: Json }
      wh40k_battle_tick: { Args: { _game: string }; Returns: undefined }
      wh40k_cancel_training: { Args: { _id: string }; Returns: number }
      wh40k_compendium: {
        Args: never
        Returns: {
          battle_type: string
          creator_id: string
          draw: boolean
          id: string
          kind: string
          opponent_id: string
          played_at: string
          points: number
          reason: string
          region_name: string
          summaries: Json
          vp_creator: number
          vp_opponent: number
          winner_id: string
        }[]
      }
      wh40k_confirm_end: { Args: { _game: string }; Returns: Json }
      wh40k_create_game: {
        Args: {
          _excluded: string[]
          _kind: string
          _list: string
          _notes: string
          _opponent: string
          _points: number
          _scheduled: string
        }
        Returns: string
      }
      wh40k_dismiss_squad: { Args: { _id: string }; Returns: undefined }
      wh40k_dispute: {
        Args: { _game: string; _note: string }
        Returns: undefined
      }
      wh40k_game_state: { Args: { _game: string }; Returns: Json }
      wh40k_rename_squad: {
        Args: { _id: string; _name: string }
        Returns: undefined
      }
      wh40k_report_battle: {
        Args: {
          _game: string
          _id: string
          _models_lost: number
          _note: string
          _wounds_lost: number
        }
        Returns: string
      }
      wh40k_restore_squad: { Args: { _id: string }; Returns: number }
      wh40k_retrain_squad: { Args: { _id: string }; Returns: number }
      wh40k_sanitize_battle: { Args: { _battle: Json }; Returns: Json }
      wh40k_save_battle: {
        Args: { _battle: Json; _game: string }
        Returns: undefined
      }
      wh40k_set_game_list: {
        Args: { _game: string; _list: string }
        Returns: undefined
      }
      wh40k_set_loadout: {
        Args: { _id: string; _loadout: Json }
        Returns: undefined
      }
      wh40k_set_squad_photo: {
        Args: { _id: string; _path: string }
        Returns: undefined
      }
      wh40k_set_summary: {
        Args: { _id: string; _kind: string; _text: string }
        Returns: undefined
      }
      wh40k_squad_price: {
        Args: { s: Database["public"]["Tables"]["wh40k_squads"]["Row"] }
        Returns: number
      }
      wh40k_tick: { Args: never; Returns: undefined }
    }
    Enums: {
      allegiance: "loyalist" | "traitor"
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allegiance: ["loyalist", "traitor"],
      app_role: ["admin", "user"],
    },
  },
} as const
