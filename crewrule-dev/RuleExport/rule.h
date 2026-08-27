
#ifndef RULE_EXPORT_H
#define RULE_EXPORT_H

#include "../db/Duty.h"
//#include "../RuleEngine/RuleEngine.h"
#include "../db/Pairing.h"
#include "../db/CrewDB.h"

//__declspec(dllexport) void initialize_db(int scenarioId, long startUtc, long endUtc);

__declspec(dllexport) struct RULE_MESSAGE{
	string idCrew;
	//第一个参数是roster id，第二个是告警信息
	map<long long,vector<string>> legalMessage;
};

__declspec(dllexport) void setDBConnection(const char* const host, const char* const user, const char* const password);


//__declspec(dllexport) void loadData(int scenarioId, long startUtc, long endUtc, vector<string> bases, vector<string> fleets, vector<string> ranks);
__declspec(dllexport) void loadData(int scenarioId);

__declspec(dllexport) bool checkRules_PO(Duty * duty);
__declspec(dllexport) int checkRules_pairings(vector<Pairing*> pairings);

__declspec(dllexport) int checkPGRulesByJson(const char* jsonFilePath, const char* jsonOutputPath);

__declspec(dllexport) bool checkMaxBlock_R4(Duty * duty);
__declspec(dllexport) bool checkMaxFDP_R4(Duty * duty);
__declspec(dllexport) bool checkBaseBasicRules(Pairing* pairing);
__declspec(dllexport) void calculateFDP(Duty* duty);
__declspec(dllexport) void setDBContext(SharedPtr<CrewDataContext> context);

//根据Rules得到最经济配比，仅仅提供给PO使用
//注释：该方法不改变原有duty, segment的配比，由调用者PO决定是否更改
__declspec(dllexport) map<string, map<string, vector<int>>> getDutyComposition(Duty* duty);
__declspec(dllexport) map<string, map<string, vector<int>>> getPGComposition(Pairing* pg);

/*返回告警信息，如果为空说明该pairing合规*/
__declspec(dllexport) vector<string> checkRules_PE(Pairing * pairing);

/*Editor在检查Roster Legality时候，把需要检查crew和roster组传给Rule*/
__declspec(dllexport) RULE_MESSAGE checkRules_RE(string idCrew, vector<long long> rosterVec);

/*isAdd是否增加ROSTER，还是删除Roster*/
//__declspec(dllexport) SharedPtr<ROSTER> syncRoster(string idCrew, Pairing* pairing, string &rank, bool isAdd = true);

__declspec(dllexport) void release_DB();

#endif