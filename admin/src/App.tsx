import { Bell, Users } from "lucide-react"
import TopbarButtonProps from "./components/TopbarButtonProps.tsx"
import { useState } from "react"
import Overview from "./views/Overview.tsx"

const tabs = [
  "Overview",
  "Terminals",
  "Console",
  "Database",
  "Settings",
] as const;

export default function Dashboard() {
  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]>("Overview");

  return (
    <div className="p-10">

      <div className="flex flex-row justify-between">
        <p className="font-fredoka text-2xl">
          Kinesis
        </p>

        <div className="flex flex-row gap-2">
          <button className="bg-black/10 p-3 rounded-lg">
            <Bell size={20} color="rgba(0,0,0,0.8)" />
          </button>
          <button className="bg-red-500 w-30 rounded-lg">
            <p className="text-white font-inter font-medium text-base">
              Shut Down
            </p>
          </button>
        </div>
      </div>

      <div className="flex flex-row">
        <div className="flex flex-row items-center gap-2">
          <Users size={16} color="rgba(0,0,0,0.4)" />

          <p className="font-inter font-light text-sm text-black/80">
            2 Users connected
          </p>
        </div>
      </div>

      <div className="bg-black/10 rounded-lg w-full p-2 my-5">
        <div className="flex flex-row gap-2">
          {tabs.map((tab) => (
            <TopbarButtonProps
              key={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </TopbarButtonProps>
          ))}
        </div>
      </div>

      <div>
        {activeTab === "Overview" && <Overview />}
      </div>

    </div>
  )
}
