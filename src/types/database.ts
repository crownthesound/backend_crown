export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      contest_links: {
        Row: {
          active: boolean | null;
          comments: number | null;
          contest_id: string | null;
          created_at: string | null;
          created_by: string;
          duration: number | null;
          embed_code: string | null;
          id: string;
          is_contest_submission: boolean | null;
          is_public: boolean;
          last_stats_update: string | null;
          likes: number | null;
          shares: number | null;
          size: number | null;
          submission_date: string | null;
          thumbnail: string;
          tiktok_video_id: string | null;
          title: string;
          updated_at: string | null;
          url: string;
          username: string;
          video_type: string | null;
          video_url: string | null;
          views: number | null;
        };
        Insert: {
          active?: boolean | null;
          comments?: number | null;
          contest_id?: string | null;
          created_at?: string | null;
          created_by: string;
          duration?: number | null;
          embed_code?: string | null;
          id?: string;
          is_contest_submission?: boolean | null;
          is_public?: boolean;
          last_stats_update?: string | null;
          likes?: number | null;
          shares?: number | null;
          size?: number | null;
          submission_date?: string | null;
          thumbnail: string;
          tiktok_video_id?: string | null;
          title: string;
          updated_at?: string | null;
          url: string;
          username: string;
          video_type?: string | null;
          video_url?: string | null;
          views?: number | null;
        };
        Update: {
          active?: boolean | null;
          comments?: number | null;
          contest_id?: string | null;
          created_at?: string | null;
          created_by?: string;
          duration?: number | null;
          embed_code?: string | null;
          id?: string;
          is_contest_submission?: boolean | null;
          is_public?: boolean;
          last_stats_update?: string | null;
          likes?: number | null;
          shares?: number | null;
          size?: number | null;
          submission_date?: string | null;
          thumbnail?: string;
          tiktok_video_id?: string | null;
          title?: string;
          updated_at?: string | null;
          url?: string;
          username?: string;
          video_type?: string | null;
          video_url?: string | null;
          views?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "contest_links_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      contest_participants: {
        Row: {
          contest_id: string;
          id: string;
          is_active: boolean | null;
          joined_at: string | null;
          user_id: string;
        };
        Insert: {
          contest_id: string;
          id?: string;
          is_active?: boolean | null;
          joined_at?: string | null;
          user_id: string;
        };
        Update: {
          contest_id?: string;
          id?: string;
          is_active?: boolean | null;
          joined_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contest_participants_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      contest_winners: {
        Row: {
          announced_at: string | null;
          contest_id: string;
          created_at: string | null;
          created_by: string;
          id: string;
          position: number;
          prize_amount: number | null;
          prize_title: string | null;
          user_id: string;
          video_id: string;
        };
        Insert: {
          announced_at?: string | null;
          contest_id: string;
          created_at?: string | null;
          created_by: string;
          id?: string;
          position: number;
          prize_amount?: number | null;
          prize_title?: string | null;
          user_id: string;
          video_id: string;
        };
        Update: {
          announced_at?: string | null;
          contest_id?: string;
          created_at?: string | null;
          created_by?: string;
          id?: string;
          position?: number;
          prize_amount?: number | null;
          prize_title?: string | null;
          user_id?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contest_winners_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_winners_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_winners_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_winners_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "contest_leaderboards";
            referencedColumns: ["video_id"];
          },
          {
            foreignKeyName: "contest_winners_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "video_links";
            referencedColumns: ["id"];
          }
        ];
      };
      contests: {
        Row: {
          cover_image: string | null;
          created_at: string | null;
          created_by: string;
          description: string;
          duration_days: number | null;
          end_date: string;
          guidelines: string | null;
          hashtags: string[] | null;
          id: string;
          industry: string | null;
          max_participants: number | null;
          music_category: string | null;
          name: string;
          num_winners: number | null;
          prize_per_winner: number | null;
          prize_titles: Json | null;
          rules: string | null;
          start_date: string;
          status: string | null;
          submission_deadline: string | null;
          total_prize: number | null;
          updated_at: string | null;
        };
        Insert: {
          cover_image?: string | null;
          created_at?: string | null;
          created_by: string;
          description: string;
          duration_days?: number | null;
          end_date: string;
          guidelines?: string | null;
          hashtags?: string[] | null;
          id?: string;
          industry?: string | null;
          max_participants?: number | null;
          music_category?: string | null;
          name: string;
          num_winners?: number | null;
          prize_per_winner?: number | null;
          prize_titles?: Json | null;
          rules?: string | null;
          start_date: string;
          status?: string | null;
          submission_deadline?: string | null;
          total_prize?: number | null;
          updated_at?: string | null;
        };
        Update: {
          cover_image?: string | null;
          created_at?: string | null;
          created_by?: string;
          description?: string;
          duration_days?: number | null;
          end_date?: string;
          guidelines?: string | null;
          hashtags?: string[] | null;
          id?: string;
          industry?: string | null;
          max_participants?: number | null;
          music_category?: string | null;
          name?: string;
          num_winners?: number | null;
          prize_per_winner?: number | null;
          prize_titles?: Json | null;
          rules?: string | null;
          start_date?: string;
          status?: string | null;
          submission_deadline?: string | null;
          total_prize?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leaderboard_config_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          created_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          role: Database["public"]["Enums"]["user_role"] | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      role_changes: {
        Row: {
          changed_at: string | null;
          changed_by: string | null;
          id: string;
          new_role: Database["public"]["Enums"]["user_role"] | null;
          old_role: Database["public"]["Enums"]["user_role"] | null;
          profile_id: string | null;
        };
        Insert: {
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          new_role?: Database["public"]["Enums"]["user_role"] | null;
          old_role?: Database["public"]["Enums"]["user_role"] | null;
          profile_id?: string | null;
        };
        Update: {
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          new_role?: Database["public"]["Enums"]["user_role"] | null;
          old_role?: Database["public"]["Enums"]["user_role"] | null;
          profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "role_changes_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_changes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      tiktok_profiles: {
        Row: {
          access_token: string | null;
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          follower_count: number | null;
          following_count: number | null;
          id: string;
          is_verified: boolean | null;
          likes_count: number | null;
          refresh_token: string | null;
          tiktok_user_id: string;
          token_expires_at: string | null;
          updated_at: string | null;
          user_id: string;
          username: string;
          video_count: number | null;
        };
        Insert: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          follower_count?: number | null;
          following_count?: number | null;
          id?: string;
          is_verified?: boolean | null;
          likes_count?: number | null;
          refresh_token?: string | null;
          tiktok_user_id: string;
          token_expires_at?: string | null;
          updated_at?: string | null;
          user_id: string;
          username: string;
          video_count?: number | null;
        };
        Update: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          follower_count?: number | null;
          following_count?: number | null;
          id?: string;
          is_verified?: boolean | null;
          likes_count?: number | null;
          refresh_token?: string | null;
          tiktok_user_id?: string;
          token_expires_at?: string | null;
          updated_at?: string | null;
          user_id?: string;
          username?: string;
          video_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tiktok_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      video_links: {
        Row: {
          active: boolean | null;
          comments: number | null;
          contest_id: string | null;
          created_at: string | null;
          created_by: string;
          duration: number | null;
          embed_code: string | null;
          id: string;
          is_contest_submission: boolean | null;
          is_public: boolean;
          last_stats_update: string | null;
          likes: number | null;
          shares: number | null;
          size: number | null;
          submission_date: string | null;
          thumbnail: string;
          tiktok_video_id: string | null;
          title: string;
          updated_at: string | null;
          url: string;
          username: string;
          video_type: string | null;
          video_url: string | null;
          views: number | null;
        };
        Insert: {
          active?: boolean | null;
          comments?: number | null;
          contest_id?: string | null;
          created_at?: string | null;
          created_by: string;
          duration?: number | null;
          embed_code?: string | null;
          id?: string;
          is_contest_submission?: boolean | null;
          is_public?: boolean;
          last_stats_update?: string | null;
          likes?: number | null;
          shares?: number | null;
          size?: number | null;
          submission_date?: string | null;
          thumbnail: string;
          tiktok_video_id?: string | null;
          title: string;
          updated_at?: string | null;
          url: string;
          username: string;
          video_type?: string | null;
          video_url?: string | null;
          views?: number | null;
        };
        Update: {
          active?: boolean | null;
          comments?: number | null;
          contest_id?: string | null;
          created_at?: string | null;
          created_by?: string;
          duration?: number | null;
          embed_code?: string | null;
          id?: string;
          is_contest_submission?: boolean | null;
          is_public?: boolean;
          last_stats_update?: string | null;
          likes?: number | null;
          shares?: number | null;
          size?: number | null;
          submission_date?: string | null;
          thumbnail?: string;
          tiktok_video_id?: string | null;
          title?: string;
          updated_at?: string | null;
          url?: string;
          username?: string;
          video_type?: string | null;
          video_url?: string | null;
          views?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "video_links_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      contest_leaderboards: {
        Row: {
          comments: number | null;
          contest_id: string | null;
          email: string | null;
          full_name: string | null;
          likes: number | null;
          rank: number | null;
          shares: number | null;
          submission_date: string | null;
          thumbnail: string | null;
          tiktok_display_name: string | null;
          tiktok_username: string | null;
          user_id: string | null;
          video_id: string | null;
          video_title: string | null;
          video_url: string | null;
          views: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "video_links_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_links_created_by_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Functions: {
      can_user_join_contest: {
        Args: { user_uuid: string; contest_uuid: string };
        Returns: boolean;
      };
      create_initial_admin: {
        Args: { admin_email: string; admin_full_name: string };
        Returns: undefined;
      };
      get_contest_leaderboard: {
        Args: { contest_uuid: string; limit_count?: number };
        Returns: {
          rank: number;
          user_id: string;
          full_name: string;
          tiktok_username: string;
          tiktok_display_name: string;
          video_id: string;
          video_title: string;
          video_url: string;
          thumbnail: string;
          views: number;
          likes: number;
          comments: number;
          shares: number;
          submission_date: string;
        }[];
      };
      update_user_role: {
        Args: {
          target_user_id: string;
          new_role: Database["public"]["Enums"]["user_role"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      contest_status: "draft" | "active" | "ended" | "archived";
      user_role: "user" | "admin" | "organizer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      contest_status: ["draft", "active", "ended", "archived"],
      user_role: ["user", "admin", "organizer"],
    },
  },
} as const;
