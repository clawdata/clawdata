import asyncio
from app.adapters.openclaw import openclaw

async def test():
    await openclaw.connect()
    result = await openclaw.sessions_list_full()
    sessions = result.get("sessions", [])
    print(f"Found {len(sessions)} sessions")

    # Find a non-main session to test
    deletable = [s for s in sessions if s.get("key") != "agent:main:main"]
    if deletable:
        key = deletable[0]["key"]
        print(f"\nAttempting delete of: {key}")
        try:
            dr = await openclaw.sessions_delete(key)
            print(f"Delete result: {dr}")
        except Exception as e:
            print(f"Delete error: {e}")

        result2 = await openclaw.sessions_list_full()
        keys_after = [s["key"] for s in result2.get("sessions", [])]
        print(f"After delete: {len(keys_after)} sessions (was {len(sessions)})")
        print(f"Key still present: {key in keys_after}")
    else:
        print("No deletable sessions found")

asyncio.run(test())
