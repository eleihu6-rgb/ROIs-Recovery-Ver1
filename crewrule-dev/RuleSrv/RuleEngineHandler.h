
#include "CrewDB.h"
#include "../RuleEngine/RuleEngine.h"
#ifdef __cplusplus
extern "C" {
#endif

	//加载场景数据（CSV)到缓存中CrewDataContext
	int rule_engine_load_data(SharedPtr<CrewDataContext>& dbData, long long scenarioId, const char* jsonName);

	//成功返回0，失败返回错误码
	int rule_engine_load(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonParamFile);
	int rule_engine_load_by_csv_file(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* fileName);

	//成功返回0，失败返回错误码
	int rule_engine_check(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonFileName, const char * sessionStr);

	//成功返回0，失败返回错误码
	int rule_engine_check_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonName);

	//成功返回0，失败返回错误码
	int rule_engine_try_pairing_on_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonName);
	
	//成功返回0，失败返回错误码
	int rule_engine_update_list(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);
	//成功返回0，失败返回错误码
	int rule_engine_update_filght(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);
	//成功返回0，失败返回错误码
	int rule_engine_route_actual_rest(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);
	int rule_engine_crew_entitlement(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);
	int rule_engine_crew_manday(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);
	int rule_engine_crew_preference(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName);

	//成功返回0，失败返回错误码
	int rule_engine_get_rosters(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * idcrew, stringstream& outputStream);

	//成功返回0，失败返回错误码，在stdout打印crew信息(crew/crew_base/crew_rank/crew_qual/...)
	int rule_engine_query_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, const char * idcrew, stringstream& outputStream);

	//成功返回0，失败返回错误码
	int rule_engine_check_duty_code(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session);

	//成功返回0，失败返回错误码
	int rule_engine_get_worry_crew(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session);

	//成功返回0，失败返回错误码
	int rule_engine_get_duty_code(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session);


	//成功返回0，失败返回错误码
	int rule_engine_update_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * csvName);

	int rule_engine_update_basedata(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> requestDbData, SharedPtr<CrewDataContext> sessionDbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonName, const char* changeType);

	//更新场景全部数据（包括动态和静态数据）。成功返回0，失败返回错误码
	int rule_engine_update_scenario(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> requestDbData, SharedPtr<CrewDataContext> sessionDbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonName);

	int rule_engine_test(SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine);

#ifdef __cplusplus
}
#endif
