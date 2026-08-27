
#ifdef __cplusplus
extern "C" {
#endif

	//定义web服务路径, 如 
	//  localhost:8000/load_scenario?scenarioId=xxx  加载场景xxx
	//  localhost:8000/check?file=xxxx               针对json文件xxxx描述的数据检查法规
	#define CMD_LOAD_SCENARIO   "/load_scenario"     //参数 scenarioId,startDtLoc,endDtLoc
	#define CMD_DESTROY_SESSION "/end_session"
	#define CMD_CHECK_RULE      "/check"
	#define CMD_CHECK_CREW		"/check_crew"
	#define CMD_ADD_ROSTER		"/add_roster"
	#define CMD_DEL_ROSTER		"/del_roster"
	#define CMD_TEST_SCENARIO   "/test_scenario"
	#define CMD_UPDATE_FLIGHT	"/update_flight"
	#define CMD_GET_ROSTERS     "/get_rosters"
	#define CMD_UPDATE_LIST		"/update_list"       //pairing、roster、flight增删改操作入口，代替原 add_roster/ del_roster

	#define CMD_TRY_PAIRING     "/try_pairing_on_crew"

	#define CMD_TEST            "/test"              //顺次执行 inBox中全部操作，包括 loadScenario
	#define CMD_TEST_NO_LOAD    "/test2"             //顺次执行 inBox中全部操作，如果已经执行过 loadScenario则不再重新load, 方便重复调试

	#define CMD_MGR_QUERY_CREW  "/query/crew"

	#define CMD_UPDATE_CREW		"/update_crew"		 //增量更新Crew并刷新和check法规

	#define CMD_ROUTE_ACT_REST  "/route_actual_rest"
	#define CMD_CREW_ENTITLEMENT "/crew_entitlement"
	#define CMD_CREW_MANDAY      "/crew_manday"
	#define CMD_CREW_PREFERENCE  "/crew_preference"  //mantis#5357

	#define CMD_UPDATE_BASEDATA  "/update_basedata" //仅更新场景静态数据
	#define CMD_UPDATE_SCENARIO  "/update_scenario"  //更新全部场景数据（重新加载场景数据），包括静态数据和动态数据

	#define CMD_CHECK_DUTY_CODE  "/check_dutycode"	 //检查dutyCode是否合法
	#define CMD_GET_DUTY_CODE  "/get_dutycode"  //获得dutyCode

	int web_srv_start();

#ifdef __cplusplus
}
#endif
