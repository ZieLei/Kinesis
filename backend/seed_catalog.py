"""
Catalog definition for the realistic test dataset (seed_test_data.py).

Each family expands into one product per (brand, variant). Costs are
purchase costs in PHP at the start of the simulated period; selling prices
are cost * markup rounded to shop-style price points. `pop` is the relative
sales popularity, `tag` lets the basket generator pick matching parts.
"""

from dataclasses import dataclass, field

# Motorcycle / scooter models common in the Philippines, used as "fits" variants.
FITS_DISC = ["Mio i125", "Click 125i", "NMAX 155", "Raider 150", "Sniper 150", "Aerox 155"]
FITS_DRUM = ["Wave 110", "XRM 125", "Mio Sporty", "Smash 115", "TMX 155", "Beat Fi"]
FITS_ALL = ["Mio i125", "Click 125i", "NMAX 155", "Raider 150", "XRM 125", "Wave 110"]

CATEGORIES = {
    "ENG": "Engine Parts",
    "LUB": "Lubricants & Fluids",
    "BRK": "Brake System",
    "TIR": "Tires & Wheels",
    "DRV": "Drivetrain",
    "ELE": "Batteries & Electrical",
    "LGT": "Lighting",
    "CTL": "Controls & Handlebars",
    "SUS": "Suspension",
    "FLT": "Filters & Fuel System",
    "FST": "Bearings, Seals & Fasteners",
    "BDY": "Mirrors & Body Parts",
    "ACC": "Accessories",
    "CLN": "Cleaning & Maintenance",
    "MSC": "Shop Consumables",
}

SUPPLIERS = {
    "ENG": "Greenhills Moto Supply",
    "LUB": "Cebu Lubricants Trading",
    "BRK": "Rapide Philippines (Dealer)",
    "TIR": "JB Tires Wholesale",
    "DRV": "Greenhills Moto Supply",
    "ELE": "Divisoria Electrical Parts",
    "LGT": "Divisoria Electrical Parts",
    "CTL": "Greenhills Moto Supply",
    "SUS": "Greenhills Moto Supply",
    "FLT": "Cebu Lubricants Trading",
    "FST": "Quezon Ave Hardware & Bearings",
    "BDY": "Divisoria Parts Trading",
    "ACC": "Divisoria Parts Trading",
    "CLN": "Cebu Lubricants Trading",
    "MSC": "Quezon Ave Hardware & Bearings",
}


@dataclass
class Family:
    cat: str
    name: str
    brands: list  # [(brand, base cost)]
    variants: list = field(default_factory=lambda: [("", 1.0)])
    markup: float = 1.35
    pop: float = 1.0
    tag: str = ""
    desc: str = ""


def V(*labels, step=0.0):
    """Variants with equal cost, or +step per position (sizes)."""
    return [(label, 1.0 + step * i) for i, label in enumerate(labels)]


FAMILIES = [
    # ---------------- Lubricants & Fluids ----------------
    Family("LUB", "4T Engine Oil 10W-40", [("Petron Sprint", 215), ("Shell Advance AX5", 290), ("Castrol Power1", 340), ("Motul 3000", 330), ("Liqui Moly Street", 420), ("Repsol Moto Rider", 310)], [("800ml", 0.82), ("1L", 1.0)], 1.28, 4.0, "oil", "Mineral/semi-synthetic 4-stroke engine oil."),
    Family("LUB", "4T Engine Oil 20W-50", [("Petron Sprint", 225), ("Shell Advance AX3", 255), ("Castrol Active", 300), ("Motul 3000", 335)], [("1L", 1.0)], 1.28, 1.8, "oil", "Higher viscosity oil for hot climates and older engines."),
    Family("LUB", "Fully Synthetic 10W-40", [("Motul 7100", 640), ("Castrol Power1 Racing", 560), ("Liqui Moly Racing", 690)], [("1L", 1.0)], 1.3, 0.8, "oil", "Fully synthetic 4T oil."),
    Family("LUB", "2T Two-Stroke Oil", [("Motul 710", 350), ("Castrol Power1 2T", 245), ("Yamalube 2T", 230)], [("1L", 1.0)], 1.3, 0.3, "", "2-stroke injector oil."),
    Family("LUB", "Scooter Gear Oil", [("Motul Scooter Gear", 78), ("Castrol Scooter", 70), ("Yamalube Gear", 82), ("Honda Genuine", 80)], [("120ml", 1.0)], 1.4, 2.2, "gearoil", "Transmission gear oil for automatic scooters."),
    Family("LUB", "DOT 3 Brake Fluid", [("Prestone", 95), ("Bosch", 120), ("Motul", 160)], [("250ml", 1.0), ("500ml", 1.7)], 1.38, 1.0, "brakefluid", "Glycol-based brake fluid."),
    Family("LUB", "Radiator Coolant", [("Prestone", 190), ("Zerex", 175), ("Petron Coolant", 150)], [("1L", 1.0)], 1.35, 0.9, "coolant", "Pre-mixed long-life coolant."),
    Family("LUB", "Chain Lube Spray", [("Motul C2", 410), ("Motul C4", 480), ("WD-40 Chain", 260), ("Bel-Ray", 340)], [("150ml", 0.78), ("400ml", 1.0)], 1.33, 1.6, "chainlube", "Spray lubricant for O-ring and standard chains."),
    Family("LUB", "Fork Oil 10W", [("Motul Fork Oil", 520), ("Putoline", 480)], [("500ml", 1.0)], 1.3, 0.3, "", "Front fork oil."),
    # ---------------- Brake System ----------------
    Family("BRK", "Front Brake Pads", [("Rapide", 185), ("Daytona", 210), ("Ferodo", 340)], [(f, 1.0 + 0.04 * i) for i, f in enumerate(FITS_DISC)], 1.45, 2.4, "brakepad", "Semi-metallic disc brake pads."),
    Family("BRK", "Rear Brake Shoes", [("Rapide", 120), ("Daytona", 140)], [(f, 1.0 + 0.03 * i) for i, f in enumerate(FITS_DRUM)], 1.45, 2.0, "brakeshoe", "Drum brake shoe set."),
    Family("BRK", "Front Brake Disc", [("Brembo", 1850), ("Daytona", 780), ("Rapide", 620)], [(f, 1.0 + 0.05 * i) for i, f in enumerate(FITS_DISC[:4])], 1.3, 0.5, "disc", "Floating front disc rotor."),
    Family("BRK", "Brake Master Cylinder Assembly", [("Rapide", 540), ("Daytona", 690)], [(f, 1.0) for f in FITS_ALL[:3]], 1.35, 0.25, "", "Front brake master cylinder with lever."),
    Family("BRK", "Brake Caliper Repair Kit", [("Rapide", 160), ("Daytona", 190)], [(f, 1.0) for f in FITS_ALL[:3]], 1.45, 0.3, "", "Seals and piston kit."),
    Family("BRK", "Brake Hose Line", [("Rapide", 190), ("Daytona", 240)], V("Front", "Rear", step=0.05), 1.4, 0.3, "", "Reinforced rubber brake line."),
    Family("BRK", "Brake Cleaner Spray", [("Prestone", 165), ("CRC", 310), ("WD-40", 230)], [("400ml", 1.0)], 1.35, 0.7, "", "Residue-free brake parts cleaner."),
    Family("BRK", "Brake Lever", [("Rapide", 95), ("Daytona", 130)], V("Left", "Right"), 1.5, 0.5, "", "Replacement brake lever."),
    # ---------------- Engine Parts ----------------
    Family("ENG", "Spark Plug", [("NGK", 95), ("Denso", 110), ("Bosch", 105), ("NGK Iridium", 420)], [("C7HSA", 1.0), ("CR7HSA", 1.05), ("CPR8EA-9", 1.1)], 1.5, 3.0, "sparkplug", "Standard motorcycle spark plug."),
    Family("ENG", "Piston Kit", [("Daytona", 1150), ("Rapide", 980), ("Honda Genuine", 1650)], [(f, 1.0 + 0.1 * i) for i, f in enumerate(["Mio i125", "Click 125i", "Raider 150", "XRM 125"])], 1.3, 0.3, "", "Piston with rings, pin and clips."),
    Family("ENG", "Cylinder Head Gasket", [("Rapide", 140), ("Daytona", 165), ("Honda Genuine", 260)], [(f, 1.0) for f in FITS_ALL[:4]], 1.45, 0.4, "", "Head gasket."),
    Family("ENG", "Valve Set", [("Daytona", 520), ("Rapide", 440)], [(f, 1.0) for f in FITS_ALL[:3]], 1.35, 0.15, "", "Intake and exhaust valve pair."),
    Family("ENG", "Clutch Lining Set", [("Daytona", 340), ("Rapide", 290), ("Yamaha Genuine", 520)], [(f, 1.0) for f in FITS_ALL[:3]], 1.4, 0.5, "clutch", "Clutch friction plates."),
    Family("ENG", "CVT Drive Belt", [("Bando", 780), ("Daytona", 560), ("Honda Genuine", 1150)], [(f, 1.0 + 0.08 * i) for i, f in enumerate(["Mio i125", "Click 125i", "NMAX 155", "Aerox 155"])], 1.3, 0.6, "cvtbelt", "CVT V-belt."),
    Family("ENG", "CVT Roller Set", [("Daytona", 220), ("Rapide", 190), ("Yamaha Genuine", 380)], [(f, 1.0) for f in FITS_ALL[:3]], 1.45, 0.6, "", "Variator weight rollers."),
    Family("ENG", "Cylinder Block Kit", [("Daytona", 3200), ("Rapide", 2750)], [(f, 1.0) for f in ["Mio i125", "Raider 150"]], 1.25, 0.1, "", "Complete cylinder block with piston."),
    Family("ENG", "Carburetor Repair Kit", [("Keihin", 260), ("Mikuni", 340)], [("Universal", 1.0)], 1.45, 0.25, "", "Jets, needle and gaskets."),
    Family("ENG", "Ignition Coil", [("NGK", 360), ("Daytona", 290), ("Honda Genuine", 640)], [(f, 1.0) for f in FITS_ALL[:3]], 1.4, 0.35, "", "Ignition coil with cap."),
    Family("ENG", "Oil Seal Set", [("Rapide", 160), ("Daytona", 190)], [(f, 1.0) for f in FITS_ALL[:3]], 1.45, 0.4, "", "Crankshaft and valve stem oil seals."),
    # ---------------- Tires & Wheels ----------------
    Family("TIR", "Tubeless Tire 80/90-17", [("Michelin City Grip", 1480), ("Corsa Platinum", 1150), ("IRC", 1280), ("Maxxis", 1360)], [("Front", 1.0), ("Rear", 1.15)], 1.25, 1.0, "tire", "Street tubeless tire."),
    Family("TIR", "Tubeless Tire 70/90-14", [("Michelin City Grip", 1320), ("Corsa Platinum", 980), ("IRC", 1090), ("Maxxis", 1210)], [("Front", 1.0), ("Rear", 1.1)], 1.25, 1.1, "tire", "Scooter tubeless tire."),
    Family("TIR", "Tubeless Tire 110/80-14", [("Michelin Pilot Street", 1980), ("Corsa Platinum", 1480), ("IRC", 1640)], [("Rear", 1.0)], 1.25, 0.7, "tire", "Wide scooter rear tire."),
    Family("TIR", "Tube-Type Tire 2.50-17", [("IRC", 720), ("Corsa", 640), ("Deestone", 590)], [("Front", 1.0), ("Rear", 1.12)], 1.3, 0.8, "tire", "Standard tire for tube-type rims."),
    Family("TIR", "Inner Tube 17-inch", [("IRC", 175), ("Deestone", 150), ("Corsa", 160)], [("2.50-17", 1.0), ("2.75-17", 1.08), ("3.00-17", 1.15)], 1.5, 1.8, "tube", "Butyl inner tube."),
    Family("TIR", "Inner Tube 14-inch", [("IRC", 190), ("Deestone", 165)], [("2.75-14", 1.0), ("3.00-14", 1.1)], 1.5, 0.8, "tube", "Butyl inner tube."),
    Family("TIR", "Tire Valve Stem", [("Generic", 18), ("Schrader", 35)], [("Pack of 2", 1.0), ("Pack of 5", 2.2)], 1.8, 1.2, "", "Rubber valve stem."),
    Family("TIR", "Mags Wheel Set", [("Daytona", 4200), ("RCB", 6800)], [("Mio 14-inch", 1.0), ("Click 14-inch", 1.05)], 1.25, 0.12, "", "Cast alloy wheel set (front and rear)."),
    Family("TIR", "Wheel Weights (Balancing)", [("Generic", 55)], [("Strip of 10", 1.0)], 1.8, 0.5, "", "Adhesive balance weights."),
    # ---------------- Drivetrain ----------------
    Family("DRV", "Chain and Sprocket Set 428", [("Daytona", 1280), ("Rapide", 1050), ("DID", 2150), ("RK", 2480)], [(f, 1.0 + 0.02 * i) for i, f in enumerate(["Raider 150", "XRM 125", "Wave 110", "TMX 155"])], 1.3, 0.9, "chainset", "Drive chain with front and rear sprockets."),
    Family("DRV", "Drive Chain 428H", [("DID", 780), ("RK", 920), ("Daytona", 520)], [("104L", 1.0), ("110L", 1.05), ("118L", 1.12)], 1.32, 0.8, "chain", "Heavy-duty drive chain."),
    Family("DRV", "Front Sprocket", [("Daytona", 190), ("Rapide", 165)], [("14T", 1.0), ("15T", 1.02), ("16T", 1.04)], 1.45, 0.5, "", "Counter sprocket."),
    Family("DRV", "Rear Sprocket", [("Daytona", 340), ("Rapide", 290)], [("36T", 1.0), ("38T", 1.03), ("40T", 1.06)], 1.45, 0.5, "", "Rear wheel sprocket."),
    Family("DRV", "Clutch Cable", [("Rapide", 120), ("Daytona", 150)], [(f, 1.0) for f in ["XRM 125", "Wave 110", "Raider 150"]], 1.5, 0.5, "", "Clutch cable."),
    Family("DRV", "Primary Drive Gear Set", [("Daytona", 1450), ("Honda Genuine", 2200)], [("Wave 110", 1.0), ("XRM 125", 1.05)], 1.3, 0.1, "", "Primary and secondary gear set."),
    # ---------------- Batteries & Electrical ----------------
    Family("ELE", "Motorcycle Battery 12V", [("Motolite", 780), ("Yuasa", 950), ("GS", 880), ("Pro Rider", 690), ("Nexus", 740)], [("5Ah", 1.0), ("7Ah", 1.22), ("9Ah", 1.5)], 1.3, 1.0, "battery", "Maintenance-free 12V battery."),
    Family("ELE", "Regulator Rectifier", [("Daytona", 540), ("Rapide", 460), ("Honda Genuine", 980)], [(f, 1.0) for f in FITS_ALL[:3]], 1.4, 0.4, "", "Voltage regulator rectifier."),
    Family("ELE", "Starter Motor", [("Daytona", 1650), ("Honda Genuine", 3100)], [(f, 1.0) for f in ["Click 125i", "Raider 150"]], 1.3, 0.1, "", "Electric starter motor."),
    Family("ELE", "Starter Relay", [("Daytona", 190), ("Rapide", 165)], [("Universal 12V", 1.0)], 1.5, 0.5, "", "Starter solenoid relay."),
    Family("ELE", "Flasher Relay", [("Daytona", 85), ("Rapide", 70), ("Denso", 140)], [("3-pin", 1.0), ("2-pin", 0.95)], 1.6, 0.7, "", "Turn signal flasher."),
    Family("ELE", "Fuse Assortment", [("Generic", 60)], [("Blade 10pc", 1.0), ("Glass 20pc", 0.9)], 1.8, 0.6, "", "Replacement fuses."),
    Family("ELE", "Horn", [("Daytona", 190), ("Rapide", 165), ("Denso", 320)], [("12V Standard", 1.0)], 1.5, 0.5, "", "Electric horn."),
    Family("ELE", "Wiring Harness", [("Daytona", 1250)], [(f, 1.0) for f in ["Mio i125", "XRM 125", "Wave 110"]], 1.3, 0.1, "", "Main wiring harness."),
    Family("ELE", "Battery Terminal Cleaner", [("Generic", 70)], [("Spray 100ml", 1.0)], 1.7, 0.3, "", "Terminal protector spray."),
    Family("ELE", "Ignition Switch Assembly", [("Daytona", 520), ("Honda Genuine", 980)], [(f, 1.0) for f in ["Mio i125", "Click 125i"]], 1.35, 0.15, "", "Key switch with keys."),
    # ---------------- Lighting ----------------
    Family("LGT", "Headlight Bulb H4", [("Philips", 260), ("Osram", 290), ("Generic", 95)], [("35/35W", 1.0), ("60/55W", 1.2)], 1.55, 1.8, "bulb", "Halogen headlight bulb."),
    Family("LGT", "LED Headlight Bulb", [("Philips", 980), ("Osram", 1150), ("Generic", 390)], [("H4 LED", 1.0), ("H6 LED", 1.0)], 1.4, 0.7, "bulb", "LED conversion bulb."),
    Family("LGT", "Brake Light Bulb 12V", [("Generic", 25), ("Philips", 55)], [("21/5W", 1.0), ("5W", 0.8)], 1.9, 2.0, "bulb", "Stop/tail bulb."),
    Family("LGT", "Turn Signal Lamp Assembly", [("Daytona", 185), ("Rapide", 150)], [("Front Pair", 1.4), ("Rear Pair", 1.4), ("Single", 0.7)], 1.5, 0.6, "", "Indicator lamp."),
    Family("LGT", "Headlight Assembly", [("Daytona", 780), ("Rapide", 650)], [(f, 1.0) for f in ["Mio i125", "XRM 125", "Wave 110"]], 1.35, 0.2, "", "Complete headlamp unit."),
    Family("LGT", "LED Fog Light Pair", [("Generic", 540), ("Hawk Eye", 980)], [("Universal", 1.0)], 1.5, 0.25, "", "Auxiliary fog lamps with switch."),
    Family("LGT", "Tail Light Assembly", [("Daytona", 540), ("Rapide", 460)], [(f, 1.0) for f in ["Mio i125", "Raider 150", "XRM 125"]], 1.4, 0.2, "", "Rear lamp unit."),
    Family("LGT", "Meter Bulb Set", [("Generic", 45)], [("Pack of 5", 1.0)], 1.9, 0.4, "", "Speedometer illumination bulbs."),
    # ---------------- Controls & Handlebars ----------------
    Family("CTL", "Handle Grips", [("Daytona", 160), ("Domino", 480), ("Rapide", 120)], [("Standard", 1.0), ("Racing", 1.2)], 1.5, 0.9, "grip", "Rubber grips (pair)."),
    Family("CTL", "Throttle Cable", [("Rapide", 95), ("Daytona", 125)], [(f, 1.0) for f in FITS_ALL[:4]], 1.5, 0.8, "cable", "Throttle cable."),
    Family("CTL", "Speedometer Cable", [("Rapide", 110), ("Daytona", 140)], [("XRM 125", 1.0), ("Wave 110", 1.0), ("Raider 150", 1.0)], 1.5, 0.3, "cable", "Speedometer drive cable."),
    Family("CTL", "Clutch Lever", [("Rapide", 95), ("Daytona", 130)], V("Standard", "Folding", step=0.15), 1.5, 0.5, "", "Replacement clutch lever."),
    Family("CTL", "Handlebar", [("Daytona", 520), ("Rapide", 430), ("Domino", 780)], [("Standard", 1.0), ("Fat Bar", 1.25)], 1.35, 0.25, "", "Steel handlebar."),
    Family("CTL", "Handlebar End Weights", [("Daytona", 190), ("Generic", 120)], [("Pair", 1.0)], 1.6, 0.5, "", "Bar-end weights."),
    Family("CTL", "Kill Switch / Handle Switch", [("Daytona", 340), ("Honda Genuine", 780)], [("Right", 1.0), ("Left", 1.0)], 1.4, 0.3, "", "Handlebar switch assembly."),
    Family("CTL", "Footpeg Set", [("Daytona", 380), ("Rapide", 310)], [("Front", 1.0), ("Rear", 1.1)], 1.45, 0.3, "", "Footrest pair."),
    # ---------------- Suspension ----------------
    Family("SUS", "Rear Shock Absorber", [("YSS", 2650), ("Daytona", 1480), ("Rapide", 1250), ("Showa", 3400)], [("Mio i125", 1.0), ("Click 125i", 1.05)], 1.28, 0.25, "shock", "Single rear shock."),
    Family("SUS", "Front Fork Seal Set", [("Rapide", 190), ("Daytona", 230), ("ARI", 310)], [("Standard", 1.0)], 1.5, 0.3, "", "Fork oil and dust seals."),
    Family("SUS", "Fork Spring", [("Daytona", 340), ("YSS", 780)], [("Pair", 1.0)], 1.35, 0.15, "", "Front fork springs."),
    Family("SUS", "Swing Arm Bushing", [("Rapide", 85), ("Daytona", 110)], [("Set of 2", 1.0)], 1.7, 0.3, "", "Swingarm pivot bushings."),
    Family("SUS", "Steering Stem Bearing Set", [("Rapide", 240), ("NSK", 520)], [("Raider 150", 1.0), ("XRM 125", 1.0)], 1.4, 0.25, "", "Upper and lower steering bearings."),
    Family("SUS", "Center Stand", [("Daytona", 780), ("Rapide", 650)], [(f, 1.0) for f in ["Mio i125", "XRM 125"]], 1.3, 0.15, "", "Center stand assembly."),
    # ---------------- Filters & Fuel System ----------------
    Family("FLT", "Air Filter Element", [("Daytona", 130), ("Rapide", 105), ("Honda Genuine", 240), ("K&N Style", 420)], [(f, 1.0) for f in FITS_ALL[:5]], 1.5, 2.2, "airfilter", "Replacement air filter."),
    Family("FLT", "Oil Filter", [("Daytona", 85), ("Honda Genuine", 150), ("Yamaha Genuine", 160)], [(f, 1.0) for f in ["Raider 150", "NMAX 155", "Click 125i"]], 1.55, 1.2, "oilfilter", "Spin-on or cartridge oil filter."),
    Family("FLT", "Fuel Filter", [("Daytona", 55), ("Rapide", 45)], [("Inline Universal", 1.0)], 1.7, 0.8, "", "Inline fuel filter."),
    Family("FLT", "Fuel Pump Assembly", [("Daytona", 1280), ("Honda Genuine", 2150)], [("Click 125i", 1.0), ("Mio i125", 1.0), ("NMAX 155", 1.2)], 1.3, 0.15, "", "Electric fuel pump."),
    Family("FLT", "Fuel Hose", [("Rapide", 45), ("Daytona", 60)], [("1 meter", 1.0)], 1.8, 0.6, "", "Rubber fuel line."),
    Family("FLT", "Fuel Injector Cleaner", [("Prestone", 280), ("Liqui Moly", 480), ("STP", 250)], [("300ml", 1.0)], 1.4, 0.6, "", "Fuel system cleaner additive."),
    Family("FLT", "Fuel Cock / Petcock", [("Daytona", 190), ("Rapide", 160)], [("XRM 125", 1.0), ("Wave 110", 1.0)], 1.5, 0.2, "", "Fuel tap assembly."),
    # ---------------- Bearings, Seals & Fasteners ----------------
    Family("FST", "Wheel Bearing", [("NSK", 140), ("Koyo", 130), ("NTN", 125), ("Generic", 70)], [("6301", 1.0), ("6302", 1.1), ("6201", 0.95), ("6202", 1.0)], 1.6, 1.0, "bearing", "Sealed deep-groove ball bearing."),
    Family("FST", "Hex Bolt Assortment", [("Generic", 95)], [("M6 x 25 (20pc)", 1.0), ("M8 x 30 (20pc)", 1.2), ("M10 x 40 (10pc)", 1.4)], 1.8, 1.0, "bolt", "Zinc-plated bolts."),
    Family("FST", "Nylon Lock Nut Pack", [("Generic", 60)], [("M6 (25pc)", 1.0), ("M8 (20pc)", 1.2), ("M10 (10pc)", 1.2)], 1.8, 0.8, "bolt", "Self-locking nuts."),
    Family("FST", "Flat Washer Pack", [("Generic", 40)], [("M6 (50pc)", 1.0), ("M8 (50pc)", 1.2)], 1.9, 0.6, "bolt", "Plain washers."),
    Family("FST", "Gasket Maker (RTV)", [("Permatex", 380), ("Three Bond", 450), ("Generic", 140)], [("85g", 1.0)], 1.35, 0.5, "", "Sealant."),
    Family("FST", "O-Ring Assortment", [("Generic", 160)], [("Metric 100pc", 1.0)], 1.6, 0.4, "", "Nitrile O-rings."),
    Family("FST", "Cotter Pin & Clip Set", [("Generic", 75)], [("Assorted", 1.0)], 1.8, 0.5, "", "Pins and circlips."),
    Family("FST", "Engine Mounting Bolt Kit", [("Daytona", 220), ("Rapide", 190)], [(f, 1.0) for f in ["Raider 150", "XRM 125"]], 1.5, 0.2, "", "Engine hanger bolts."),
    Family("FST", "Oil Seal Assortment", [("NOK", 380), ("Generic", 190)], [("Mixed 24pc", 1.0)], 1.5, 0.2, "", "Common sizes."),
    # ---------------- Mirrors & Body Parts ----------------
    Family("BDY", "Side Mirror", [("Daytona", 190), ("Rapide", 150), ("Honda Genuine", 380)], [("Pair Left+Right", 2.0), ("Single", 1.0)], 1.5, 0.9, "mirror", "Rear-view mirror."),
    Family("BDY", "Fairing Set", [("Daytona", 2850), ("Rapide", 2400)], [(f, 1.0) for f in ["Mio i125", "Click 125i"]], 1.3, 0.1, "", "Painted body panel set."),
    Family("BDY", "Fender (Front)", [("Daytona", 340), ("Rapide", 290)], [(f, 1.0) for f in ["XRM 125", "Wave 110", "Raider 150"]], 1.45, 0.25, "", "Front fender."),
    Family("BDY", "Seat Cover", [("Daytona", 340), ("Rapide", 280)], [("Black Universal", 1.0), ("Red Stitch", 1.1)], 1.5, 0.35, "", "Replacement seat cover."),
    Family("BDY", "Rear Grab Rail", [("Daytona", 380), ("Rapide", 320)], [("Mio i125", 1.0), ("Click 125i", 1.05)], 1.45, 0.2, "", "Passenger grab rail."),
    Family("BDY", "Side Cover", [("Daytona", 240), ("Rapide", 200)], V("Left", "Right"), 1.5, 0.25, "", "Frame side cover."),
    Family("BDY", "Muffler / Exhaust", [("Daytona", 1650), ("Rapide", 1250), ("Prospeed", 2850)], [("Standard", 1.0), ("Racing", 1.3)], 1.3, 0.25, "", "Exhaust muffler."),
    # ---------------- Accessories ----------------
    Family("ACC", "Helmet Half-Face", [("Spyder", 780), ("Zeus", 1450), ("Mach1", 650), ("MT", 1850)], [("Medium", 1.0), ("Large", 1.0)], 1.35, 0.9, "helmet", "DOT-certified open-face helmet."),
    Family("ACC", "Helmet Full-Face", [("Spyder", 1650), ("Zeus", 2450), ("LS2", 3800), ("Nolan", 5400)], [("Medium", 1.0), ("Large", 1.0)], 1.3, 0.5, "helmet", "Full-face helmet."),
    Family("ACC", "Riding Gloves", [("Komine", 680), ("Alpinestars", 1850), ("Generic", 240)], [("M", 1.0), ("L", 1.0)], 1.45, 0.6, "", "Padded riding gloves."),
    Family("ACC", "Raincoat Set", [("Ridersport", 520), ("Tuff", 440), ("Generic", 260)], [("Medium", 1.0), ("Large", 1.0), ("XL", 1.0)], 1.5, 1.0, "rain", "Two-piece rain suit."),
    Family("ACC", "Phone Holder", [("Rok", 420), ("Generic", 190)], [("Handlebar Mount", 1.0), ("Mirror Mount", 1.0)], 1.5, 0.7, "", "Waterproof phone mount."),
    Family("ACC", "Disc Lock", [("Kovix", 780), ("Generic", 250)], [("Standard", 1.0)], 1.45, 0.4, "", "Anti-theft disc lock."),
    Family("ACC", "Motorcycle Cover", [("Generic", 290), ("Spyder", 450)], [("Medium", 1.0), ("Large", 1.15)], 1.5, 0.4, "", "Weatherproof cover."),
    Family("ACC", "USB Charger", [("Generic", 240), ("Rok", 380)], [("Handlebar 2.1A", 1.0)], 1.6, 0.6, "", "Dual USB charger."),
    Family("ACC", "Luggage Rack / Top Box Base", [("Givi", 1450), ("Daytona", 780)], [("Universal", 1.0)], 1.35, 0.2, "", "Rear carrier."),
    Family("ACC", "Top Box", [("Givi", 3400), ("Kappa", 3900), ("Generic", 1450)], [("33L", 1.0), ("45L", 1.3)], 1.3, 0.15, "", "Rear storage box."),
    Family("ACC", "Handlebar Knuckle Guard", [("Generic", 340), ("Rok", 580)], [("Pair", 1.0)], 1.5, 0.3, "", "Hand protection."),
    # ---------------- Cleaning & Maintenance ----------------
    Family("CLN", "Motorcycle Shampoo", [("Motul", 380), ("Meguiar's", 340), ("Generic", 120)], [("500ml", 1.0)], 1.4, 0.8, "", "Wash shampoo."),
    Family("CLN", "Chain Cleaner", [("Motul", 480), ("WD-40", 290), ("Bel-Ray", 420)], [("400ml", 1.0)], 1.35, 0.6, "", "Degreaser spray."),
    Family("CLN", "Polish and Wax", [("Meguiar's", 520), ("Turtle Wax", 380), ("Generic", 140)], [("250ml", 1.0)], 1.4, 0.5, "", "Body polish."),
    Family("CLN", "Multi-Purpose Lubricant", [("WD-40", 220), ("CRC 5-56", 260)], [("191ml", 1.0), ("382ml", 1.8)], 1.35, 1.4, "", "Penetrating oil."),
    Family("CLN", "Microfiber Towel", [("Generic", 70)], [("Pack of 3", 1.0)], 1.8, 0.6, "", "Polishing cloths."),
    Family("CLN", "Tire Shine", [("Armor All", 260), ("Meguiar's", 340)], [("300ml", 1.0)], 1.4, 0.4, "", "Rubber dressing."),
    # ---------------- Shop Consumables ----------------
    Family("MSC", "Zip Ties", [("Generic", 38)], [("Black 100pc", 1.0), ("White 100pc", 1.0)], 1.9, 1.0, "", "Nylon cable ties."),
    Family("MSC", "Electrical Tape", [("3M", 55), ("Nitto", 35)], [("Black", 1.0), ("Assorted 5pc", 4.0)], 1.8, 1.0, "", "PVC insulating tape."),
    Family("MSC", "Shop Rags", [("Generic", 80)], [("1 kg Bundle", 1.0)], 1.7, 0.7, "", "Cotton cleaning rags."),
    Family("MSC", "Disposable Gloves", [("Generic", 130)], [("Box of 50", 1.0)], 1.6, 0.4, "", "Nitrile gloves."),
    Family("MSC", "Thread Locker", [("Loctite 243", 380), ("Three Bond", 340)], [("10ml", 1.0)], 1.4, 0.4, "", "Medium-strength threadlocker."),
    Family("MSC", "Duct Tape", [("3M", 120), ("Generic", 65)], [("48mm", 1.0)], 1.7, 0.5, "", "Cloth tape."),
    Family("MSC", "Epoxy Putty", [("Pacific", 85), ("Generic", 50)], [("Stick 50g", 1.0)], 1.7, 0.5, "", "Repair putty."),
]

SERVICES = [
    # name, description, price, est. cost, popularity
    ("Engine Oil Change (Labor)", "Drain and refill engine oil; oil is sold separately.", 150, 35, 5.0),
    ("Tire Replacement (per tire)", "Remove and fit a new tire, includes bead lubrication.", 200, 60, 2.2),
    ("Tire Puncture Repair (Tube Type)", "Locate and patch a punctured inner tube.", 80, 15, 3.0),
    ("Tubeless Tire Plug / Patch", "Plug or patch a tubeless tire.", 120, 25, 2.2),
    ("Brake Pad Replacement", "Replace front or rear disc brake pads and clean the caliper.", 150, 30, 2.6),
    ("Brake Shoe Replacement", "Replace drum brake shoes and adjust.", 120, 25, 1.8),
    ("Chain Adjustment and Lubrication", "Adjust chain slack and lubricate.", 80, 10, 2.6),
    ("Chain and Sprocket Replacement", "Fit a new chain and sprockets, align the wheel.", 350, 70, 1.0),
    ("Battery Replacement", "Remove the old battery and install a new one, check charging.", 100, 15, 1.4),
    ("Spark Plug Replacement", "Remove and replace the spark plug, check gap.", 80, 10, 2.0),
    ("Air Filter Cleaning", "Clean and re-oil the air filter element.", 60, 10, 1.2),
    ("Air Filter Replacement", "Install a new air filter element.", 100, 15, 1.4),
    ("Basic Motorcycle Inspection", "Visual and functional safety check of brakes, tires, lights and chain.", 150, 30, 1.6),
    ("General Maintenance and Tune-Up", "Oil change labor, spark plug, air filter, chain and brake adjustments.", 650, 150, 1.5),
    ("CVT Cleaning (Scooter)", "Clean CVT housing, rollers and belt.", 450, 90, 1.1),
    ("Carburetor Cleaning and Tuning", "Strip, ultrasonic-clean and tune the carburetor.", 500, 100, 0.9),
    ("Throttle / Clutch Cable Replacement", "Replace and adjust a cable.", 200, 30, 0.8),
    ("Wheel Balancing", "Balance one wheel with adhesive weights.", 150, 25, 0.9),
    ("Headlight / Bulb Installation", "Fit and aim a headlight or bulb.", 60, 5, 1.0),
    ("Valve Clearance Adjustment", "Check and adjust valve lash.", 400, 60, 0.5),
    ("Fork Seal Replacement", "Replace front fork seals and refill oil.", 700, 120, 0.3),
    ("Engine Overhaul (Top End)", "Top-end overhaul labor: gasket, piston and valve work.", 2800, 600, 0.12),
]
