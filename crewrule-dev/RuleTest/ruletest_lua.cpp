#ifdef ENABLE_LUABRIDGE_LUA

#include <iostream>
#include <string>
#include <map>

#include "Lua/LuaLibrary.h"
#include "LuaBridge/LuaBridge.h"

#include "exprtk/exprtk.hpp"

void report_errors(lua_State* luaState, int status) {
    if (status == 0) {
        return;
    }

    std::cerr << "[LUA ERROR] " << lua_tostring(luaState, -1) << std::endl;

    // remove error message from Lua state
    lua_pop(luaState, 1);
}

bool test_lua_case() {

    lua_State* L = luaL_newstate();
    luaL_openlibs(L);

    {  // 为了让 LuaRef 对象在 lua_close(L) 之前析构

        const char* str =
            "world = 'World'\n"
            "sayHello = function(to)\n"
            "    print('Hello, ' .. to .. '!')\n"
            "end\n";
        luaL_dostring(L, str);

        using namespace luabridge;

        LuaRef world = getGlobal(L, "world");
        LuaRef say_hello = getGlobal(L, "sayHello");

        int count = 10;
        for (int i = 0; i < count; i++) {
            say_hello(world.cast<const char*>());
            
        }
        
    }

    lua_close(L);
	return true;
}


bool test_lua_case2() {

    lua_State* L = luaL_newstate();
    luaL_openlibs(L);

    {  // 为了让 LuaRef 对象在 lua_close(L) 之前析构

        const char* str =
            "calc = function(STA,STD)\n"
            "    return (STA - STD)/2\n"
            "end\n";
        luaL_dostring(L, str);

        using namespace luabridge;

        LuaRef calc = getGlobal(L, "calc");

        exprtk::timer timer;
        timer.start();

        int count = 100000000;
        time_t sta = 1726794000;
        time_t std = 1726786800;
        for (int i = 0; i < count; i++) {
            sta = sta + i * 1000;
            std = std + i * 2;
            time_t result = calc(sta, std);
            //std::cout << "result=" << result << std::endl;
        }

        timer.stop();
        printf("[lua] count:%d, Total Time:%12.8f  Rate:%14.3fevals/sec\n",
            count,
            timer.time(),
            count / timer.time());
    }

    lua_close(L);
    return true;
}

bool test_lua_case_error2() {

    lua_State* L = luaL_newstate();
    luaL_openlibs(L);

    {  // 为了让 LuaRef 对象在 lua_close(L) 之前析构

        const char* str =
            "calc = function(map)\n"
            "    return map[\"STA\"] - map[\"STD\"]\n"
            "end\n";
        luaL_dostring(L, str);

        using namespace luabridge;

        std::map<std::string, time_t> mapVar;
        mapVar.insert(std::make_pair("STA", 20000));
        mapVar.insert(std::make_pair("STD", 10000));
        LuaRef calc = getGlobal(L, "calc");

        time_t result = calc(mapVar);
    }

    lua_close(L);
    return true;
}

#endif //ENABLE_LUABRIDGE_LUA