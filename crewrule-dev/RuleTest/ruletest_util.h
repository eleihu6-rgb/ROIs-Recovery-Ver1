#ifndef RULE_TEST_UTIL_H
#define RULE_TEST_UTIL_H
#include <string>
#include "CrewDB.h"
#include "RuleEngine.h"

//初始化duty
//计算：BH, FDP, DP；生成：dutyNode
void calcAndInitDuty(Duty* duty, LegalityChecker* ruleEngine);

//替换ruleParam为 test case内定义值, 代替csv读入数据
//按输入 item替换 dbData中法规，只保留一行DBRule，且参数按目标为准
void replaceRuleItem(ruleParams* item, int function, shared_ptr<CrewDataContext> dbData);

//util
string strToLower(string s);
char* ss(string s); //string -> char*
void printPtnStr(string s);
//创建seg
Segment *	makeSegment(std::string assignment, std::string fltNum, std::string date, std::string dep, std::string arv, std::string fleet, std::string tail, std::string std, std::string sta, std::string atd, std::string ata);
Segment	*	makeSeg(string assignment, string fltNum, string dep, string arv, string std, string sta);
Duty	*	makeDuty(string segmentStrs);
vector<Duty*> makeDuties(string dutyStrs, LegalityChecker* ruleEngine);
Pairing *	makePairing(string ptnStr, LegalityChecker* ruleEngine);

Duty	*	makeDuty(vector<string>& lines, LegalityChecker* ruleEngine);
vector<Duty*> makeDuties(vector<string>& segStrs, LegalityChecker* ruleEngine);
Pairing	*	makePairing(vector<string>& ptnSegStrs, LegalityChecker* ruleEngine);
#endif//RULE_TEST_UTIL_H