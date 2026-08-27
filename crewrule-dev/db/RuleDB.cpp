#include <stdio.h>
#include <sstream>
#include <vector>
#include <memory>

#include <time.h>
#include <algorithm>
#include <string>
#include <sstream>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "Log/Logger.h"

using namespace std;

//从法规列表获取rolling day定义值
#define DEFAULT_ROLLING_DAY    3
int getRollingDaysFromRuleList(vector<DBRule>& ruleList) {
	for (std::size_t i = 0; i < ruleList.size(); i++) {
		DBRule r = ruleList[i];
		if (r.function == 4004) {
			const char * rollingDayStr = r.params["rollingDays"].c_str();
			return atoi(rollingDayStr);
		}
	}
	return DEFAULT_ROLLING_DAY;
}

//
//1、按rule 2029计算base每一天duty上限，若无定义则按默认9999处理
//2、结果result为map，key为base:fleet，value为该base:fleet在场景中每一天duty上限
//3、根据leadin pairing/duty数从result中对应base和天数扣除上限数值
//4、举例, 如 {SZX: [999, 999, 999, 999, 999, 999, 999]}表示szx在场景7天里每天上限都是999
void computeBaseDutyPerDayLimit(
	time_t scenarioStartDtUtc,
	time_t scenarioEndDtUtc,
	vector<Pairing*>& leadinPairings,
	vector<DBRule>& ruleList,
	vector<string>& bases,
	vector<string>& fleets,
	map<string, vector<int>>& result)
{
	//初始化各个base
	int days = 1 + static_cast<int>(scenarioEndDtUtc - scenarioStartDtUtc) / (24 * 3600);
	result.clear();
	for (auto& base : bases) {
		for (auto& fleet : fleets) {
			string key = base + ":" + fleet;
			result.insert(make_pair(key, vector<int>()));
			for (int i = 0; i < days; i++) {
				result[key].push_back(999); //default 999
			}
		}
	}

	//rule 2029
	//20180525 ain, mantis#3383, 大小写兼容方式读取 param
	for (DBRule& rule : ruleList) {
		if (rule.function == 2029) {
			string base = rule.getRuleParamValue("Base");
			string fleet = rule.getRuleParamValue("Fleet");
			int dutyLimit = atoi(rule.getRuleParamValue("maxNumOfDutiesPerDay").c_str());

			string key = base + ":" + fleet;
			if (result.find(key) != result.end()) {
				for (int i = 0; i < days; i++)
					result[key][i] = dutyLimit;
			}
		}
	}

	//count leadin duty
	for (Pairing* p : leadinPairings) {
		string key = p->getBase() + ":" + p->getFltCode();
		for (std::size_t di = 0; di < p->getNumDuties(); di++) {
			Duty * duty = p->getDuty(di);
			time_t dutyStart = duty->getStartTimeUtcSch();
			if (dutyStart >= scenarioStartDtUtc && dutyStart < scenarioEndDtUtc) {
				int dayIndex = static_cast<int>(dutyStart - scenarioStartDtUtc) / (24 * 3600);
				if (result.find(key) != result.end())
					result[key][dayIndex] --;
			}
		}
	}

	//log
	time_t firstDay = getStartTimeOfDay(utcToLocal(scenarioStartDtUtc));
	Logger::getRuleLogger()->info("Duty Limit Per Day:");
	//日期行
	std::ostringstream oss;
	for (int i = 0; i < days; i++) {
		time_t dt = firstDay + i * 24 * 3600;
		tm* m = localtime(&dt);
		oss<<" " << (m->tm_mon + 1) << "/" <<  m->tm_mday;
	}
	Logger::getRuleLogger()->info("\t{}", oss.str());
	//内容
	for (auto& it : result) {
		string key = it.first;
		std::ostringstream oss;
		Logger::getRuleLogger()->info("[{}] ", key.c_str());
		for (int limit : it.second) {
			oss << limit << " ";
		}
		Logger::getRuleLogger()->info("[{}] {}", key.c_str(), oss.str());
	}
}


void DBRule::copyFrom(DBRule* rule) {
	strncpy(this->classType, rule->classType, sizeof(this->classType));
	strncpy(this->description, rule->description, sizeof(this->description));
	strncpy(this->storeType, rule->storeType, sizeof(this->storeType));
	//strncpy(this->table, rule->table, sizeof(this->table));
	//strncpy(this->row, rule->row, sizeof(this->row));
	this->idRule = rule->idRule;
	this->idRuleSet = rule->idRuleSet;
	this->function = rule->function;
	this->phase = rule->phase;
	this->severity = rule->severity;
	this->tableNum = rule->tableNum;
	this->rowNum = rule->rowNum;
	this->overridebility = rule->overridebility;//mantis#2325, for csv parsing
	this->source = rule->source;
	this->reference = rule->reference;
	this->category = rule->category;
	this->exceptionCode = rule->exceptionCode;
	this->exceptionCodes = rule->exceptionCodes;
}


bool DBRule::compare(DBRule& r1, DBRule& r2) {
	if (r1.idRule != r2.idRule)
		return r1.idRule < r2.idRule;
	if (r1.tableNum != r2.tableNum)
		return r1.tableNum < r2.tableNum;
	if (r1.rowNum < r2.rowNum)
		return r1.rowNum < r2.rowNum;
	return false;
}


//获取 rule_parameter, 兼容 name大小写, 若未找到目标paramName则抛出exception
string DBRule::getRuleParamValue(string name) {
	if (params.find(name) != params.end())
		return params[name];
	string upperCaseName = strToUpper(name);
	if (params.find(upperCaseName) != params.end())
		return params[upperCaseName];
	Logger::getRuleLogger()->error("invalid data, rule_param[{}].{} not found", this->idRule, name);
	return "";
}
