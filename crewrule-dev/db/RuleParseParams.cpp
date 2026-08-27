#include <stdio.h>
#include <sstream>
#include <iostream>
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
#include "StringUtil.h"
#include "Log/Logger.h"

#include <ErrorCodeDef.h>

shared_ptr<ruleParams> parseRuleParam8002(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8003(vector<DBRule>& list);
shared_ptr<ruleParams> parseRuleParam8004(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8005(vector<DBRule>& list);
shared_ptr<ruleParams> parseRuleParam8008(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8023(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8028(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8014(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2109(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2124(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8115(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8116(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3010(DBRule& item);

shared_ptr<ruleParams> parseRuleParam8015(DBRule& item);
shared_ptr<ruleParams> parseRuleParam7269(DBRule& item);

shared_ptr<ruleParams> parseRuleParam8037(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8637(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8042(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8054(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8055(DBRule& item, vector<SharedPtr<DBRule_8014>>& assignsAndGrps);

shared_ptr<ruleParams> parseRuleParam8056(DBRule& item);
shared_ptr<ruleParams> parseRuleParam7270(DBRule& item);

shared_ptr<ruleParams> parseRuleParam8059(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8064(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8071(DBRule& item);

shared_ptr<ruleParams> parseRuleParam2003(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2004(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8074(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8075(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8006(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8077(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8092(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8114(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2030(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2130(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3021(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3022(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3023(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3024(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8126(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8141(DBRule& item);
shared_ptr<ruleParams> parseRuleParam2007(DBRule& item);
shared_ptr<ruleParams> parseRuleParam3007(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8107(DBRule& item);
shared_ptr<ruleParams> parseRuleParam8117(DBRule& item);

//打印ruleParam参数解析错误
static map<string, int> _errorCount;
static void ruleParamParseErrorLog(int errcode, int func, const char* paramName) {
	stringstream ss;
	ss << errcode << "_" << func << "_" << paramName;
	string k = ss.str();
	if (_errorCount.find(k) != _errorCount.end() && _errorCount[k] != 0) {
		return;
	}
	_errorCount[k]++;
	string errKey = ss.str();
	if (errcode == ERR_RULE_PARAM_NOT_FOUND) Logger::getRuleLogger()->warn("ERROR: invalid rule_param, func={} paramName={} not found", func, paramName);
	else if (errcode == ERR_RULE_PARAM_EMPTY)     Logger::getRuleLogger()->error("ERROR: invalid rule_param, func={} paramName={} is empty", func, paramName);
	else if (errcode == ERR_RULE_PARAM_NUMBER) Logger::getRuleLogger()->error("ERROR: invalid rule_param, func={} paramName={} is not number", func, paramName);
}
//解析ruleParam流程
void PARSE_RULE_PARAM(int func, map<string, string>& parameter, string name, string& strValue, bool bAllowEmpty, bool bMustNum) {
	int ret = retriveRuleParameter(parameter, name, strValue, bAllowEmpty, bMustNum);
	ruleParamParseErrorLog(ret, func, name.c_str());
}

	
//mantis#2149
//预处理：解析rule参数，放入rule->parsedParam, 每一func各自继承不同ruleCache子类
void parseRuleParams(vector<DBRule>& list, vector<SharedPtr<DBRule_8014>>& assignsAndGrps) {
	if (assignsAndGrps.empty()) {
		Logger::getRuleLogger()->warn("WARN: invalid data, parseRuleParams(), assignsAndGrps is empty");
	}
	Logger::getRuleLogger()->debug("Rule Parameter Parsing Starting......");

	shared_ptr<ruleParams> ruleParam8003 = parseRuleParam8003(list);
	shared_ptr<ruleParams> ruleParam8005 = parseRuleParam8005(list);
	
	for (DBRule& i : list) {
		//Logger::getRuleLogger()->debug("Rule Parameter Parsing idRule:{}, idRuleParam:{}", i.idRule, i.idRuleParam);
		try {
			switch (i.function) {
			case 2003:
				i.parsedParam = parseRuleParam2003(i); break;
			case 2004:
				i.parsedParam = parseRuleParam2004(i); break; 
			case 2007:
				i.parsedParam = parseRuleParam2007(i); break;
			case 3007:
				i.parsedParam = parseRuleParam3007(i); break;
			case 2109:
				i.parsedParam = parseRuleParam2109(i); break;
			case 2124:
			case 2125: //20191004 ain, 2125与2124相同法规格式, 只做检查不做赋值
				i.parsedParam = parseRuleParam2124(i); break;
			case 3010:
				i.parsedParam = parseRuleParam3010(i); break;
			case 8002:
				i.parsedParam = parseRuleParam8002(i); break;
			case 8003: 
				//mantis#2219, 8003需要一次处理全部列表，因此只在第一个rule param对象保存完整parseRuleParam，后续rule param留空
				if (ruleParam8003.get()) {
					i.parsedParam = ruleParam8003;  
					ruleParam8003 = nullptr;
				}
				break;
			case 8004:
				i.parsedParam = parseRuleParam8004(i); break;
			case 8005:
				if (ruleParam8005.get()) {
					i.parsedParam = ruleParam8005;
					ruleParam8005 = nullptr;
				}
				break;
			case 8008:
				i.parsedParam = parseRuleParam8008(i); break;
			case 8014:
				i.parsedParam = parseRuleParam8014(i); break;
			case 8015:
				i.parsedParam = parseRuleParam8015(i); break;
			case 7269:
				i.parsedParam = parseRuleParam7269(i); break;
            case 8023:
                i.parsedParam = parseRuleParam8023(i); break;
            case 8028:
				i.parsedParam = parseRuleParam8028(i); break;			
			case 8037:
				i.parsedParam = parseRuleParam8037(i); break;
			case 8637:
				i.parsedParam = parseRuleParam8637(i); break;
			case 8042:
				i.parsedParam = parseRuleParam8042(i); break;
			case 8054:
				i.parsedParam = parseRuleParam8054(i); break;
			case 8055:
				i.parsedParam = parseRuleParam8055(i, assignsAndGrps); break;
			case 8056:
				i.parsedParam = parseRuleParam8056(i); break;
			case 7270:
				i.parsedParam = parseRuleParam7270(i); break;
			case 8059:
				i.parsedParam = parseRuleParam8059(i); break;
			case 8064:
				i.parsedParam = parseRuleParam8064(i); break;
			case 8071:
				i.parsedParam = parseRuleParam8071(i); break;
			case 8074:
				i.parsedParam = parseRuleParam8074(i); break;//mantis#2198, 添加8074 cache
			case 8075:
				i.parsedParam = parseRuleParam8075(i); break;
			case 8006:
				i.parsedParam = parseRuleParam8006(i); break; 
			case 8077:
				i.parsedParam = parseRuleParam8077(i); break;
			case 8092:
				i.parsedParam = parseRuleParam8092(i); break;
			case 8114:
				i.parsedParam = parseRuleParam8114(i); break;
			case 8115:
				i.parsedParam = parseRuleParam8115(i); break;
			case 8116:
				i.parsedParam = parseRuleParam8116(i); break;
			case 2030:
				i.parsedParam = parseRuleParam2030(i); break;
			case 2130:
				i.parsedParam = parseRuleParam2130(i); break;
			case 3021:
				i.parsedParam = parseRuleParam3021(i); break;
			case 3022:
				i.parsedParam = parseRuleParam3022(i); break;
			case 3023:
				i.parsedParam = parseRuleParam3023(i); break;
			case 3024:
				i.parsedParam = parseRuleParam3024(i); break;
			case 8126:
				i.parsedParam = parseRuleParam8126(i); break;
			case 8117:
				i.parsedParam = parseRuleParam8117(i); break;
			case 8107:
				i.parsedParam = parseRuleParam8107(i); break;
			case 8141:
				i.parsedParam = parseRuleParam8141(i); break;
			}
		}
		catch(std::exception e) {
			Logger::getRuleLogger()->error("Rule Parameter Parsing idRule:{}, idRuleParam:{}, error: {}", i.idRule, i.idRuleParam, e.what());
		}
	}
}

//8002
shared_ptr<ruleParams> parseRuleParam8002(DBRule& item) {

	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strMax, strPrdDesc, strProrated, strLastDay = "0", strMin = "00:00";
	string strBase, strRank, strFleet, strPeriod, strType, strTeams = "*";
	string intOperationBLH = "*", augOperationBLH = "*", dutyAloftTime = "*";
	string hasSBYorFLY, reductionPerDuty;
	PARSE_RULE_PARAM(func, parameter,"BASES",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW TEAMS",strTeams,true,false);
	PARSE_RULE_PARAM(func, parameter,"PERIOD",strPeriod,true,false);
	PARSE_RULE_PARAM(func, parameter,"UNIT",strPrdDesc,true,false);
	PARSE_RULE_PARAM(func, parameter,"PRORATED",strProrated,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX LIMITS",strMax,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN LIMITS",strMin,true,false);
	PARSE_RULE_PARAM(func, parameter,"TYPE",strType,true,false);
	PARSE_RULE_PARAM(func, parameter, "INT OPERATION BLH", intOperationBLH, true, false);
	PARSE_RULE_PARAM(func, parameter, "AUG OPERATION BLH", augOperationBLH, true, false);
	PARSE_RULE_PARAM(func, parameter, "DUTY ALOT TIME", dutyAloftTime, true, false);
	PARSE_RULE_PARAM(func, parameter, "HAS SBY OR FLY(Y/N)", hasSBYorFLY, true, false);

	//跨06:00以上时区的Duty，每个Duty扣减值(分钟数)
	if (parameter.find("REDUCTION PER DUTY") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "REDUCTION PER DUTY", reductionPerDuty, true, false);
	}
	else if (parameter.find("DP REDUCTION FOR 06:00+ TIME ZONE DUTY") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DP REDUCTION FOR 06:00+ TIME ZONE DUTY", reductionPerDuty, true, false);
	}
	else if (parameter.find("REDUCTION FOR 06:00+ TIME ZONE DUTY") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "REDUCTION FOR 06:00+ TIME ZONE DUTY", reductionPerDuty, true, false);
	}

	int iMax = 0;
	string::size_type position = strMax.find(":");
	if (position != strMax.npos) {
		try {
			iMax = atoi(strMax.substr(0, position).c_str()) * 60 + atoi(strMax.substr(position + 1).c_str());
		}
		catch (...) {
			iMax = 99999;
		}
	}
	else {
		try {
			iMax = atoi(strMax.c_str());
			//iMax = iMax * 60;
		}
		catch (...) {
			iMax = 999999;
		}
	}

	int iMin = 0;
	position = strMin.find(":");
	if (position != strMin.npos) {
		try {
			iMin = atoi(strMin.substr(0, position).c_str()) * 60 + atoi(strMin.substr(position + 1).c_str());
		}
		catch (...) {
			iMin = 0;
		}

	}
	else {
		try {
			iMin = atoi(strMin.c_str());
			//iMin = iMin * 60;
		}
		catch (...)
		{
			iMin = 0;
		}
	}


	shared_ptr<rule8002> cache = shared_ptr<rule8002>(new rule8002);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strTeams = strTeams;
	cache->strPeriod = strPeriod;
	cache->strPrdDesc = strPrdDesc;
	cache->strProrated = strProrated;
	cache->strMax = strMax;
	cache->strMin = strMin;
	cache->strType = strType;
	cache->iMin = iMin;
	cache->iMax = iMax;

	cache->intOperationBLH = intOperationBLH;
	if (intOperationBLH != "*") {
		vector<string> splitstrs;
		split(intOperationBLH.c_str(), '-', splitstrs);
		if (splitstrs.size() >= 2) {
			cache->intOperationBLHMinutesLower = hhmmToMinutes(splitstrs[0].c_str());
			cache->intOperationBLHMinutesUpper = hhmmToMinutes(splitstrs[1].c_str());
		}
	}
	
	cache->augOperationBLH = augOperationBLH;
	if (augOperationBLH != "*") {
		vector<string> splitstrs;
		split(augOperationBLH.c_str(), '-', splitstrs);
		if (splitstrs.size() >= 2) {
			cache->augOperationBLHMinutesLower = hhmmToMinutes(splitstrs[0].c_str());
			cache->augOperationBLHMinutesUpper = hhmmToMinutes(splitstrs[1].c_str());
		}
	}

	cache->dutyAloftTime = dutyAloftTime;
	if (dutyAloftTime != "*") {
		vector<string> splitstrs;
		split(dutyAloftTime.c_str(), '-', splitstrs);
		if (splitstrs.size() >= 2) {
			cache->dutyAloftTimeMinutesLower = hhmmToMinutes(splitstrs[0].c_str());
			cache->dutyAloftTimeMinutesUpper = hhmmToMinutes(splitstrs[1].c_str());
		}
	}

	cache->hasSBYorFLY = (hasSBYorFLY.empty() || hasSBYorFLY == "*") ? nullptr : make_shared<bool>(hasSBYorFLY == "Y");

	cache->reductionPerDuty = reductionPerDuty;
	cache->reductionMinutesPerDuty = hhmmToMinutes(reductionPerDuty.c_str());
	return cache;
}


shared_ptr<ruleParams> parseRuleParam2007(DBRule & item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string composition, withBunk, maxFdp, maxExtension;
	PARSE_RULE_PARAM(func, parameter,"COMPOSITION",composition,true,false);
	PARSE_RULE_PARAM(func, parameter,"WITH_BUNK",withBunk,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX FDP",maxFdp,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX EXTENSION",maxExtension,true,false);

	shared_ptr<rule2007> cache = shared_ptr<rule2007>(new rule2007);
	cache->composition = composition;
	cache->withBunk = withBunk;
	cache->maxFdp = hhmmStrToMinutes(maxFdp);
	cache->maxExtension = hhmmStrToMinutes(maxExtension);
	return cache;
}

//8003
shared_ptr<ruleParams> parseRuleParam8003(vector<DBRule>& list) {
	int ret = 0;
	shared_ptr<rule8003> cache = shared_ptr<rule8003>(new rule8003);
	auto normalizeRuleParamValue = [](const string& value) {
		return strToUpper(trim(value));
	};
	auto splitNormalizedRuleParam = [&](const string& value, vector<string>& values) {
		vector<string> rawValues;
		split(value.c_str(), '|', rawValues);
		for (const auto& rawValue : rawValues) {
			string normalizedValue = normalizeRuleParamValue(rawValue);
			if (!normalizedValue.empty()) {
				values.push_back(normalizedValue);
			}
		}
	};
	for (auto& item_l : list) {
		if (item_l.function != 8003)
			continue;
		//,,,,
		int func = item_l.function;
		map<string, string>& parameter = item_l.params;
		string airline, activeRank, actingRank, qual, assignmentGroup;
		string qualFleets = "*", qualFleetsGroup = "*", crewFleets = "*";
		PARSE_RULE_PARAM(func, parameter,"AIRLINE",airline,true,false);
		PARSE_RULE_PARAM(func, parameter,"ACTIVE RANKS",activeRank,true,false);
		PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",actingRank,true,false);
		if (parameter.find("QUALS") != parameter.end()) {
			PARSE_RULE_PARAM(func, parameter,"QUALS",qual,true,false);
		}
		else {
			PARSE_RULE_PARAM(func, parameter,"QUAL",qual,true,false);
		}
		PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT GROUPS",assignmentGroup,true,false);
		if (parameter.find("QUAL FLEETS") != parameter.end()) {
			PARSE_RULE_PARAM(func, parameter, "QUAL FLEETS", qualFleets, true, false);
		}
		if (parameter.find("QUAL FLEET GROUPS") != parameter.end()) {
			PARSE_RULE_PARAM(func, parameter, "QUAL FLEET GROUPS", qualFleetsGroup, true, false);
		}
		if (parameter.find("CREW FLEETS") != parameter.end()) {
			PARSE_RULE_PARAM(func, parameter, "CREW FLEETS", crewFleets, true, false);
		}

		
		rule8003item item;
		item.airline = airline;
		item.activeRank = activeRank;
		item.actingRank = actingRank;
		item.qual = qual;
		item.assignmentGroupStr = assignmentGroup;
		item.qualFleetsStr = normalizeRuleParamValue(qualFleets);
		item.qualFleetsGroupStr = normalizeRuleParamValue(qualFleetsGroup);
		item.crewFleetsStr = normalizeRuleParamValue(crewFleets);
		split(assignmentGroup.c_str(), '|', item.assignmentGroups);
		split(actingRank.c_str(), '|', item.actingRanks);
		split(activeRank.c_str(), '|', item.activeRanks);
		split(qual, '|', item.quals);
		splitNormalizedRuleParam(qualFleets, item.qualFleets);
		splitNormalizedRuleParam(qualFleetsGroup, item.qualFleetsGroups);
		splitNormalizedRuleParam(crewFleets, item.crewFleets);

		cache->list.push_back(item);
	}
	return cache;
}

//8004
shared_ptr<ruleParams> parseRuleParam8004(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBase, strRank, strFleet, strType, strEnable, strGrace, strUnit,strAssignments = "*";
	PARSE_RULE_PARAM(func, parameter,"BASE",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"TYPE",strType,true,false);
	PARSE_RULE_PARAM(func, parameter,"ENABLE CHECK",strEnable,true,false);
	PARSE_RULE_PARAM(func, parameter,"GRACE PERIOD",strGrace,false,true);
	PARSE_RULE_PARAM(func, parameter,"UNIT",strUnit,true,false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENTS", strAssignments, true, false);

	shared_ptr<rule8004> cache = shared_ptr<rule8004>(new rule8004);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strType = strType;
	cache->strUnit = strUnit;
	cache->assignments = strAssignments;
	cache->isEnable = (strEnable == "Y");
	cache->iGracePeriod = retriveIntFromStr(strGrace, 0);
	cache->lGrace = (strUnit == "CD") ? cache->iGracePeriod * 24 * 3600 : 0;
	return cache;
}

//8005
shared_ptr<ruleParams> parseRuleParam8005(vector<DBRule>& list) {
	//rule param格式: 每行为一组, '|'分隔若干airport, 相互衔接时不警告, 如 TPE|TSA, SHA|PVG
	//cache->multimap中保存每一组pair正反两个key-value，如 {{TPE,TSA}, {TSA,TPE}}
	int ret = 0;
	int func = 8005;
	shared_ptr<rule8005> cache = shared_ptr<rule8005>(new rule8005);

	for (DBRule& item : list) {
		if (item.function != 8005)
			continue;

		map<string, string>& parameter = item.params;
		string groupStr;
		if (item.tableNum == 2) {
			// mantis#5340
			PARSE_RULE_PARAM(func, parameter,"EXCLUDE ASSIGNMENT GROUPS",groupStr,true,false);

			if (groupStr != "*" && groupStr != "-") {
				split(groupStr.c_str(), '|', cache->excludeAssignmentGroups);
			}

			PARSE_RULE_PARAM(func, parameter,"EXCLUDE ASSIGNMENT QUALS",groupStr,true,false);

			split(groupStr.c_str(), '|', cache->excludeAssignmentQuals);
		}
		else {
			vector<string> groupAirports;
			PARSE_RULE_PARAM(func, parameter,"NO WARNING GROUPS",groupStr,true,false);

			split(groupStr.c_str(), '|', groupAirports);

			for (string& airport1 : groupAirports) {
				for (string& airport2 : groupAirports) {
					if (airport2 == airport1)
						continue;
					cache->noWarningAirportPairs.insert(make_pair(airport1, airport2));
					cache->noWarningAirportPairs.insert(make_pair(airport2, airport1));
				}
			}
		}
	}
	return cache;
}

//8015
shared_ptr<ruleParams> parseRuleParam8015(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strRestType, strMinRest, strMinCalDays, strMinLocalNights, strLocationBase;
	string strLabels = "*", strStandbys = "*", strMaxSector, strMinFlightTime, strMinFDP, strExceptionCode, strExceptionAssignmentGroups;
	
	if (item.tableNum == 1) {
		//MAX SECTOR,MIN FLIGHT TIME,MIN FDP,(OR) SBY QUALIFIER,(OR)LABELS
		PARSE_RULE_PARAM(func, parameter,"(OR)LABELS",strLabels,true,false);
		PARSE_RULE_PARAM(func, parameter,"MAX SECTOR",strMaxSector,true,false);
		PARSE_RULE_PARAM(func, parameter,"MIN FLIGHT TIME",strMinFlightTime,true,false);
		PARSE_RULE_PARAM(func, parameter,"MIN FDP",strMinFDP,true,false);
		PARSE_RULE_PARAM(func, parameter,"(OR)SBY QUALIFIERS",strStandbys,true,false);
		PARSE_RULE_PARAM(func, parameter, "EXCEPTION CODE", strExceptionCode, true, false);
	}
	else if (item.tableNum == 2) {
		//REST TYPE,MIN REST LENGTH,MIN CALENDAR DAYS,MIN LOCAL NIGHTS,LOCATION
		PARSE_RULE_PARAM(func, parameter,"REST TYPE",strRestType,true,false);
		PARSE_RULE_PARAM(func, parameter,"MIN REST LENGTH",strMinRest,true,false);
		PARSE_RULE_PARAM(func, parameter,"MIN CALENDAR DAYS",strMinCalDays,true,true);
		PARSE_RULE_PARAM(func, parameter,"MIN LOCAL NIGHTS",strMinLocalNights,true,true);
		PARSE_RULE_PARAM(func, parameter,"LOCATION",strLocationBase,true,false);
		PARSE_RULE_PARAM(func, parameter, "EXCEPTION ASSIGNMENT GROUPS", strExceptionAssignmentGroups, true, false);

	}
	shared_ptr<rule8015> cache = shared_ptr<rule8015>(new rule8015);
	transform(strRestType.begin(), strRestType.end(), strRestType.begin(), ::toupper);
	cache->strRestType = strRestType;
	cache->strMinRest = strMinRest;
	cache->strMinCalDays = strMinCalDays;
	cache->strMinLocalNights = strMinLocalNights;
	cache->strLocationBase = strLocationBase;

	cache->strMaxSector = strMaxSector;
	cache->strMinFlightTime = strMinFlightTime;
	cache->strMinFDP = strMinFDP;
	cache->strLabels = strLabels;
	cache->strStandbys = strStandbys;
	

	cache->iMinRest = hhmmToMinutes(strMinRest.c_str());
	cache->iRequiredCalDays = atoi(strMinCalDays.c_str());
	cache->iMinLocalNights = atoi(strMinLocalNights.c_str());
	cache->exceptionCode = strExceptionCode;
	split(strExceptionAssignmentGroups, '|', cache->exceptionAssignmentGroups);
	return cache;
}

shared_ptr<ruleParams> parseRuleParam8023(DBRule& item) {
    int ret = 0;
    int func = item.function;
    map<string, string>& parameter = item.params;
    string strBase, strRank, strFleet, strTeam, strGroup, strMinDO, strPeriod, strUnit, strMonthNumber = "*", strLayoverTimemode, strRefDate, strPostRest, strCountBlankDay, strCountLayover, strIsRolling, strCheckType,
		strLastRosterLatestEndTime = "*", strLastRosterAssignments = "*", strRPDaysRange = "*";

    PARSE_RULE_PARAM(func, parameter,"BASES",strBase,true,false);
    PARSE_RULE_PARAM(func, parameter,"RANKS",strRank,true,false);
    PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleet,true,false);
    PARSE_RULE_PARAM(func, parameter,"CREW TEAMS",strTeam,true,false);
    PARSE_RULE_PARAM(func, parameter,"DO ASSIGNMENT GROUP",strGroup,true,false);
    PARSE_RULE_PARAM(func, parameter,"MIN DO",strMinDO,true, true);
    PARSE_RULE_PARAM(func, parameter,"PERIOD",strPeriod,true, false);
    PARSE_RULE_PARAM(func, parameter,"UNIT",strUnit,true, false);
    PARSE_RULE_PARAM(func, parameter,"MONTH NUMBERS",strMonthNumber,true, false);
    PARSE_RULE_PARAM(func, parameter,"LAYOVER TIMEMODE",strLayoverTimemode,true, false);
    PARSE_RULE_PARAM(func, parameter,"REF DATE",strRefDate,true, false);
    PARSE_RULE_PARAM(func, parameter,"UTILIZE POST DUTY REST",strPostRest,true, false);
    PARSE_RULE_PARAM(func, parameter,"COUNT BLANK DAY",strCountBlankDay,true, false);
    PARSE_RULE_PARAM(func, parameter,"COUNT LAYOVER",strCountLayover,true, false);
    PARSE_RULE_PARAM(func, parameter,"IS ROLLING",strIsRolling,true, false);
	PARSE_RULE_PARAM(func, parameter, "CHECK TYPE", strCheckType, true, false);
	PARSE_RULE_PARAM(func, parameter, "LAST ROSTER LATEST END TIME", strLastRosterLatestEndTime, true, false);
	PARSE_RULE_PARAM(func, parameter, "LAST ROSTER ASSIGNMENTS", strLastRosterAssignments, true, false);
	PARSE_RULE_PARAM(func, parameter, "RP DAYS RANGE", strRPDaysRange, true, false);

    shared_ptr<rule8023> cache = shared_ptr<rule8023>(new rule8023);
    cache->rBase = strBase;
    cache->rRank = strRank;
    cache->rFleet = strFleet;
    cache->rTeam = strTeam;
    cache->rGroup = strGroup;
    cache->rMinDO = strMinDO;
    cache->rPeriod = strPeriod;
    cache->rUnit = strUnit;
    cache->rMonthNumber = strMonthNumber;
    cache->rLayoverTimemode = strToUpper(strLayoverTimemode);
    cache->rRefDate = strRefDate;
    cache->rPostRest = (strPostRest == "Y");
    cache->rCountBlankDay = (strCountBlankDay == "Y");
    cache->rCountLayover = (strCountLayover == "Y");
    cache->rIsRolling = (strIsRolling == "Y");
	cache->rCheckType = strCheckType;
	cache->rLastRosterLatestEndTime = strLastRosterLatestEndTime;
	cache->rRPDaysRange = strRPDaysRange;
	split(strLastRosterAssignments, '|', cache->rLastRosterAssignments);

    return cache;
}

//7269
shared_ptr<ruleParams> parseRuleParam7269(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strRestType, strMinRest, strMinCalDays, strMinLocalNights, strLocationBase;
	string strLabels = "*", strStandbys = "*", strMaxSector, strMinFlightTime, strMinFDP, strExceptionCode, strExceptionAssignmentGroups;

	if (item.tableNum == 1) {
		//MAX SECTOR,MIN FLIGHT TIME,MIN FDP,(OR) SBY QUALIFIER,(OR)LABELS
		PARSE_RULE_PARAM(func, parameter, "(OR)LABELS", strLabels, true, false);
		PARSE_RULE_PARAM(func, parameter, "MAX SECTOR", strMaxSector, true, false);
		PARSE_RULE_PARAM(func, parameter, "MIN FLIGHT TIME", strMinFlightTime, true, false);
		PARSE_RULE_PARAM(func, parameter, "MIN FDP", strMinFDP, true, false);
		PARSE_RULE_PARAM(func, parameter, "(OR)SBY QUALIFIERS", strStandbys, true, false);
		PARSE_RULE_PARAM(func, parameter, "EXCEPTION CODE", strExceptionCode, true, false);
	}
	else if (item.tableNum == 2) {
		//REST TYPE,MIN REST LENGTH,MIN CALENDAR DAYS,MIN LOCAL NIGHTS,LOCATION
		PARSE_RULE_PARAM(func, parameter, "REST TYPE", strRestType, true, false);
		PARSE_RULE_PARAM(func, parameter, "MIN REST LENGTH", strMinRest, true, false);
		PARSE_RULE_PARAM(func, parameter, "MIN CALENDAR DAYS", strMinCalDays, true, true);
		PARSE_RULE_PARAM(func, parameter, "MIN LOCAL NIGHTS", strMinLocalNights, true, true);
		PARSE_RULE_PARAM(func, parameter, "LOCATION", strLocationBase, true, false);
		PARSE_RULE_PARAM(func, parameter, "EXCEPTION ASSIGNMENT GROUPS", strExceptionAssignmentGroups, true, false);

	}
	shared_ptr<rule7269> cache = shared_ptr<rule7269>(new rule7269);
	transform(strRestType.begin(), strRestType.end(), strRestType.begin(), ::toupper);
	cache->strRestType = strRestType;
	cache->strMinRest = strMinRest;
	cache->strMinCalDays = strMinCalDays;
	cache->strMinLocalNights = strMinLocalNights;
	cache->strLocationBase = strLocationBase;

	cache->strMaxSector = strMaxSector;
	cache->strMinFlightTime = strMinFlightTime;
	cache->strMinFDP = strMinFDP;
	cache->strLabels = strLabels;
	cache->strStandbys = strStandbys;


	cache->iMinRest = hhmmToMinutes(strMinRest.c_str());
	cache->iRequiredCalDays = atoi(strMinCalDays.c_str());
	cache->iMinLocalNights = atoi(strMinLocalNights.c_str());
	cache->exceptionCode = strExceptionCode;
	split(strExceptionAssignmentGroups, '|', cache->exceptionAssignmentGroups);
	return cache;
}

//8037
shared_ptr<ruleParams> parseRuleParam8037(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strCrewBase, strMaxDaysOutOfBase, strLocation, strMaxDaysInBaseWithoutExit;

	PARSE_RULE_PARAM(func, parameter,"CREW BASE",strCrewBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"LOCATION",strLocation,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX OUT OF BASE DAYS",strMaxDaysOutOfBase,true,true);
	PARSE_RULE_PARAM(func, parameter,"MAX DAYS IN LOCATION",strMaxDaysInBaseWithoutExit,true,true);

	shared_ptr<rule8037> cache = shared_ptr<rule8037>(new rule8037);
	cache->crewBase = strCrewBase;
	cache->maxDaysOutOfBase = atoi(strMaxDaysOutOfBase.c_str());
	cache->location = strLocation;
	cache->maxDaysInLocation = atoi(strMaxDaysInBaseWithoutExit.c_str());
	return cache;
}

//8637
shared_ptr<ruleParams> parseRuleParam8637(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strCrewBase, strMaxDaysOutOfBase, strLocation, strMaxDaysInBaseWithoutExit;

	PARSE_RULE_PARAM(func, parameter,"CREW BASE",strCrewBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"LOCATION",strLocation,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX OUT OF BASE DAYS",strMaxDaysOutOfBase,true,true);
	PARSE_RULE_PARAM(func, parameter,"MAX DAYS IN LOCATION",strMaxDaysInBaseWithoutExit,true,true);

	shared_ptr<rule8637> cache = shared_ptr<rule8637>(new rule8637);
	cache->crewBase = strCrewBase;
	cache->maxDaysOutOfBase = atoi(strMaxDaysOutOfBase.c_str());
	cache->location = strLocation;
	cache->maxDaysInLocation = atoi(strMaxDaysInBaseWithoutExit.c_str());
	return cache;
}

//8054
shared_ptr<ruleParams> parseRuleParam8054(DBRule& item) {
	string strBase, strRank, strQualifyDays, strPercentage, strAssignment;
	int ret = 0;
	int func = item.function;
	string rFleet, rGap, rCrewBase, rCrewRank, rCrewFleet, rMinTimes, rOperate, rAssignment, rActingRank, rQual = "*", rUnit;
	map<string, string>& parameter = item.params;
	PARSE_RULE_PARAM(func, parameter,"BASE",rCrewBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",rCrewRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",rCrewFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"RECENCY FLEET",rFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"BACKWARD PERIOD",rGap,true,true);
	PARSE_RULE_PARAM(func, parameter,"MIN TIMES",rMinTimes,true,true);
	PARSE_RULE_PARAM(func, parameter,"OPERATE",rOperate,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT",rAssignment,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANK",rActingRank,true,false);
	PARSE_RULE_PARAM(func, parameter, "QUAL", rQual, true, false);
	PARSE_RULE_PARAM(func, parameter, "UNIT", rUnit, true, false);


	shared_ptr<rule8054> cache = shared_ptr<rule8054>(new rule8054);
	cache->rFleet = rFleet;
	cache->rGap = rGap;
	cache->rCrewBase = rCrewBase;
	cache->rCrewRank = rCrewRank;
	cache->rCrewFleet = rCrewFleet;
	cache->rMinTimes = rMinTimes;
	cache->rOperate = rOperate;
	cache->rAssignment = rAssignment;
	cache->rActingRank = rActingRank;
	cache->iGapCD = atoi(rGap.c_str());
	cache->iTimes = atoi(rMinTimes.c_str());
	cache->rQual = rQual;
	cache->rUnit = rUnit;
	split(rFleet, '|', cache->recencyFleetList);
	split(rQual, '|', cache->qualifications);

	vector<string> actingRankList;
	split(rActingRank.c_str(), '|', actingRankList);
	for (string& item : actingRankList) {
		cache->actingRankMap[item] = true;
	}
	vector<string> assignmentList;
	split(rAssignment.c_str(), '|', assignmentList);
	for (string& item : assignmentList) {
		cache->assignmentMap[item] = true;
	}

	return cache;
}

//8055
shared_ptr<ruleParams> parseRuleParam8055(DBRule& item, vector<SharedPtr<DBRule_8014>>& assignsAndGrps) {
	string strBase, strRank, strQualifyDays, strPercentage, strAssignment;
	int ret = 0;
	int func = item.function;
	string rFleet, rActingRank, rMinTimes, rQualification, strDep, strArr, rAttribute, rCrewNationality = "*", rRequired = "99", rGroups = "*";
	map<string, string>& parameter = item.params;
	PARSE_RULE_PARAM(func, parameter,"FLIGHT FLEETS",rFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANK",rActingRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITY",rCrewNationality,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEP",strDep,true,false);
	PARSE_RULE_PARAM(func, parameter,"ARR",strArr,true,false);
	PARSE_RULE_PARAM(func, parameter,"ATTRIBUTES",rAttribute,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT ASSIGNMENT GROUPS",rGroups,true,false);
	PARSE_RULE_PARAM(func, parameter,"REQUIRED",rRequired,true,false);
	PARSE_RULE_PARAM(func, parameter,"REQUIRED QUALIFICATION",rQualification,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN TIMES",rMinTimes,true,false);

	shared_ptr<rule8055> cache = shared_ptr<rule8055>(new rule8055);
	cache->rFleet = rFleet;
	cache->rActingRank = rActingRank;
	cache->rMinTimes = rMinTimes;
	cache->rQualification = rQualification;
	cache->strDep = strDep;
	cache->strArr = strArr;
	cache->rAttribute = rAttribute;
	cache->rCrewNationality = rCrewNationality;
	cache->rRequired = rRequired;
	cache->rGroups = rGroups;

	cache->iTimes = atoi(rMinTimes.c_str());
	cache->iRequired = atoi(rRequired.c_str());


	split(strDep.c_str(), '|', cache->strDepps);
	split(strArr.c_str(), '|', cache->strArrs);
	split(rFleet.c_str(), '|', cache->strFleets);
	split(rAttribute.c_str(), '|', cache->strAttributes);
	split(rGroups.c_str(), '|', cache->vAssignmentGroups);

	if (rGroups != "*")
	{
		for (SharedPtr<DBRule_8014>& item : assignsAndGrps)
		{
			if (std::find(cache->vAssignmentGroups.begin(), cache->vAssignmentGroups.end(), item->assignmentGroup) != cache->vAssignmentGroups.end())
			{
				cache->vAssignments.push_back(item->assignemnt);
			}
		}
	}
	return cache;
}


//8059
shared_ptr<ruleParams> parseRuleParam8059(DBRule& item) {
	string strBase, strRank, strQualifyDays, strPercentage, strAssignment;
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	PARSE_RULE_PARAM(func, parameter,"ROSTER BASE",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANK",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"QUALIFY DAYS",strQualifyDays,true,true);
	PARSE_RULE_PARAM(func, parameter,"PERCENTAGE OF QUALIFIED CREW",strPercentage,true,true);
	PARSE_RULE_PARAM(func, parameter,"STANDBY ASSIGNMENT GROUP",strAssignment,true,false);

	shared_ptr<rule8059> cache = shared_ptr<rule8059>(new rule8059);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strQualifyDays = strQualifyDays;
	cache->strPercentage = strPercentage;
	cache->strAssignment = strAssignment;
	cache->percentageOfQCA = atof(strPercentage.c_str());
	cache->iQualifyDays = atoi(strQualifyDays.c_str());
	return cache;
}

//8064
shared_ptr<ruleParams> parseRuleParam8064(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;

	string strAttributeA, strAttributeB;
	string strIsReqA, strIsReqB, strQualA, strQualB;
	string strLabelA, strLabelB, strAssignmentA, strAssignmentB, strAEqualToBase = "*", strBEqualToBase = "*";
	string strBase, strRank, strFleet, strDirectional;

	PARSE_RULE_PARAM(func, parameter,"BASES",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"ATTRIBUTES A",strAttributeA,true,false);
	PARSE_RULE_PARAM(func, parameter,"LABELS A",strLabelA,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENTS A",strAssignmentA,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS REQUESTED A",strIsReqA,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS REQUESTED B",strIsReqB,true,false);
	PARSE_RULE_PARAM(func, parameter,"ATTRIBUTES B",strAttributeB,true,false);
	PARSE_RULE_PARAM(func, parameter,"LABELS B",strLabelB,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENTS B",strAssignmentB,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIRECTIONAL",strDirectional,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS LOCATION EQUAL BASE A",strAEqualToBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS LOCATION EQUAL BASE B",strBEqualToBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"QUALIFIERS A",strQualA,true,false);
	PARSE_RULE_PARAM(func, parameter,"QUALIFIERS B",strQualB,true,false);


	shared_ptr<rule8064> cache = shared_ptr<rule8064>(new rule8064);
	cache->bDirectional = (strDirectional == "Y");
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strAttributeA = strAttributeA;
	cache->strLabelA = strLabelA;
	cache->strAssignmentA = strAssignmentA;
	cache->strIsReqA = strIsReqA;
	cache->strIsReqB = strIsReqB;
	cache->strAttributeB = strAttributeB;
	cache->strLabelB = strLabelB;
	cache->strAssignmentB = strAssignmentB;
	cache->strAEqualToBase = strAEqualToBase;
	cache->strBEqualToBase = strBEqualToBase;
	cache->strQualA = strQualA;
	cache->strQualB = strQualB;

	split(strLabelA.c_str(), '|', cache->vecLabelA);
	split(strLabelB.c_str(), '|', cache->vecLabelB);
	split(strAttributeA.c_str(), '|', cache->vecAttrA);
	split(strAttributeB.c_str(), '|', cache->vecAttrB);
	split(strAssignmentA.c_str(), '|', cache->vecAssignmentA);
	split(strAssignmentB.c_str(), '|', cache->vecAssignmentB);
	split(strQualA.c_str(), '|', cache->vecQualA);
	split(strQualB.c_str(), '|', cache->vecQualB);

	return cache;

}

//8006
shared_ptr<ruleParams> parseRuleParam8006(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBase, strRank, strFleet, strTeams = "*",strAtt="*",strGroups, strCrewNationality;
	
	PARSE_RULE_PARAM(func, parameter,"BASES",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW TEAMS",strTeams,true,false);
	PARSE_RULE_PARAM(func, parameter,"APPLICABLE ATTRIBUTES",strAtt,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT GROUPS",strGroups,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITY",strCrewNationality,true,false);


	//assignmentGroups
	shared_ptr<rule8006> cache = shared_ptr<rule8006>(new rule8006);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strTeam = strTeams;
	split(strAtt.c_str(), '|', cache->attributes);
	split(strGroups.c_str(), '|', cache->assignmentGroups);
	split(strCrewNationality.c_str(), '|', cache->crewNationality);
	return cache;
}


//8074
shared_ptr<ruleParams> parseRuleParam8074(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBase, strRank, strFleet, strTeams = "*";
	//mantis#2198, 解析参数按全词大写
	PARSE_RULE_PARAM(func, parameter,"BASES",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW TEAMS",strTeams,true,false);

	shared_ptr<rule8074> cache = shared_ptr<rule8074>(new rule8074);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strTeam = strTeams;
	return cache;
}
//8075
shared_ptr<ruleParams> parseRuleParam8075(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strNationality, strDeparture = "*", strArrival = "*", strMax, strRank, strBase, strMin, strFleet = "*", strCrewFleet = "*", strActingRanks = "*", strNumbers = "*", strIsDirectional, strSegAssignGrps;
	PARSE_RULE_PARAM(func, parameter,"BASE",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",strCrewFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",strActingRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITIES",strNationality,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPS",strDeparture,true,false);
	PARSE_RULE_PARAM(func, parameter,"ARVS",strArrival,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT NUMBERS",strNumbers,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX LIMITS",strMax,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN LIMITS",strMin,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIRECTIONAL",strIsDirectional,true,false);
	PARSE_RULE_PARAM(func, parameter,"SEGMENT ASSIGNMENT GROUPS",strSegAssignGrps,true,false);

	
	shared_ptr<rule8075> cache = shared_ptr<rule8075>(new rule8075);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strCrewFleet = strCrewFleet;
	cache->strFleet = strFleet;
	cache->strActingRanks = strActingRanks;
	cache->strNationality = strNationality;
	cache->strDeparture = strDeparture;
	cache->strArrival = strArrival;
	cache->strNumbers = strNumbers;
	cache->strMax = strMax;
	cache->strMin = strMin;
	cache->isDirectional = (strIsDirectional == "Y");
	cache->strSegAssignGrps = strSegAssignGrps;

	split(strNationality.c_str(), '|', cache->nationalities);
	split(strActingRanks.c_str(), '|', cache->actingRanks);
	split(strDeparture.c_str(), '|', cache->depStations);
	split(strArrival.c_str(), '|', cache->arrStations);
	split(strNumbers.c_str(), '|', cache->fltNumbers);
	split(strSegAssignGrps.c_str(), '|', cache->segAssignGrps);
	split(strFleet.c_str(), '|', cache->fltFleets);
	return cache;
}

//8077
shared_ptr<ruleParams> parseRuleParam8077(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	shared_ptr<rule8077> cache = shared_ptr<rule8077>(new rule8077);
	//BASES,RANKS,FLEETS,CREW NATIONALITIES,PAIRING DUTY,ATTRIBUTES,LABELS,MAX CREW
	PARSE_RULE_PARAM(func, parameter,"BASES",cache->strBases,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",cache->strRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",cache->strFleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITIES",cache->strNationalities,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX LIMITS",cache->strMax,true,false);
	PARSE_RULE_PARAM(func, parameter,"PAIRING DUTY",cache->strDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"ATTRIBUTES",cache->strAttributes,true,false);
	PARSE_RULE_PARAM(func, parameter,"LABELS",cache->strLabels,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",cache->strActingRanks,true,false);

	split(cache->strNationalities.c_str(), '|', cache->nationalities);
	split(cache->strLabels.c_str(), '|', cache->labels);
	split(cache->strAttributes.c_str(), '|', cache->attributes);
	split(cache->strActingRanks.c_str(), '|', cache->actingRanks);
	return cache;
}

//8042
shared_ptr<ruleParams> parseRuleParam8042(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strNationality, strDeparture = "*", strArrival = "*", strMax, strRank, strBase, strMin, strFleet = "*", strCrewFleet = "*", strActingRanks = "*", strNumbers = "*", strDestinationCountries = "*", strIsDirectional, strSegAssignGrps;
	PARSE_RULE_PARAM(func, parameter,"BASE",strBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",strRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",strCrewFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT FLEETS",strFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",strActingRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITIES",strNationality,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPS",strDeparture,true,false);
	PARSE_RULE_PARAM(func, parameter,"ARVS",strArrival,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT NUMBERS",strNumbers,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX LIMITS",strMax,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN LIMITS",strMin,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIRECTIONAL",strIsDirectional,true,false);
	PARSE_RULE_PARAM(func, parameter,"SEGMENT ASSIGNMENT GROUPS",strSegAssignGrps,true,false);
	PARSE_RULE_PARAM(func, parameter, "DESTINATION COUNTRIES", strDestinationCountries, true, false);


	shared_ptr<rule8042> cache = shared_ptr<rule8042>(new rule8042);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strCrewFleet = strCrewFleet;
	cache->strFleet = strFleet;
	cache->strActingRanks = strActingRanks;
	cache->strNationality = strNationality;
	cache->strDeparture = strDeparture;
	cache->strArrival = strArrival;
	cache->strNumbers = strNumbers;
	cache->strMax = strMax;
	cache->strMin = strMin;
	cache->isDirectional = (strIsDirectional == "Y");
	cache->strSegAssignGrps = strSegAssignGrps;
	cache->strDestinationCountries = strDestinationCountries;

	if (cache->strNationality.find("!(") == string::npos) {
		split(strNationality.c_str(), '|', cache->nationalities);
	}
	else {
		string except = cache->strNationality.substr(2, cache->strNationality.size() - 3);
		split(except.c_str(), '|', cache->exceptNationalities);
	}
	split(strActingRanks.c_str(), '|', cache->actingRanks);
	split(strDeparture.c_str(), '|', cache->depStations);
	split(strArrival.c_str(), '|', cache->arrStations);
	split(strNumbers.c_str(), '|', cache->fltNumbers);
	split(strSegAssignGrps.c_str(), '|', cache->segAssignGrps);
	split(strFleet.c_str(), '|', cache->fltFleets);
	split(strDestinationCountries.c_str(), '|', cache->destinationCountries);
	return cache;
}

//3010
shared_ptr<ruleParams> parseRuleParam3010(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	
	string strCheckin, strCheckout, strAirport, strType, strDHDIn, strDHDOut, strOIn, strOOut, strPickup, strDropoff;
	string strFltNum = "*", strFleets = "*", strDepStart = "00:00", strDepEnd = "23:59", strGTIn = "0", strGTOut = "0";

	PARSE_RULE_PARAM(func, parameter,"AIRPORT",strAirport,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLT NUMS",strFltNum,true,false);

	//PARSE_RULE_PARAM(func, parameter,"FLEETS",strFleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPSTART",strDepStart,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPEND",strDepEnd,true,false);
	
	if (parameter.find("DUTY TYPE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DUTY TYPE",strType,true,false);
	}
	else if (parameter.find("DIR") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DIR",strType,true,false);
	}

	PARSE_RULE_PARAM(func, parameter,"FLY BRIEF",strCheckin,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLY DEBRIEF",strCheckout,true,false);
	PARSE_RULE_PARAM(func, parameter,"DHD BRIEF",strDHDIn,true,false);
	PARSE_RULE_PARAM(func, parameter,"DHD DEBRIEF",strDHDOut,true,false);
	PARSE_RULE_PARAM(func, parameter,"TRAIN BRIEF",strGTIn,true,false);
	PARSE_RULE_PARAM(func, parameter,"TRAIN DEBRIEF",strGTOut,true,false);
	PARSE_RULE_PARAM(func, parameter,"OTHER BRIEF",strOIn,true,false);
	PARSE_RULE_PARAM(func, parameter,"OTHER DEBRIEF",strOOut,true,false);
	PARSE_RULE_PARAM(func, parameter,"PICK UP",strPickup,true,false);
	PARSE_RULE_PARAM(func, parameter,"DROP OFF",strDropoff,true,false);


	shared_ptr<rule3010> cache = shared_ptr<rule3010>(new rule3010);
	cache->airport = strAirport;
	cache->areaType = strType;
	cache->pFlightNumbers = strFltNum;
	split(strFltNum.c_str(), '|', cache->flightNumbers);

	cache->pFleets = strFleets;
	split(strFleets.c_str(), '|', cache->fleets);

	cache->depStart = isHHmm(strDepStart.c_str()) ? hhmmToMinutes(strDepStart.c_str()) : atoi(strDepStart.c_str());
	cache->depEnd = isHHmm(strDepEnd.c_str()) ? hhmmToMinutes(strDepEnd.c_str()) : atoi(strDepEnd.c_str());

	cache->flyBrief = isHHmm(strCheckin.c_str()) ? hhmmToMinutes(strCheckin.c_str()) : atoi(strCheckin.c_str());
	cache->flyDebrief = isHHmm(strCheckout.c_str()) ? hhmmToMinutes(strCheckout.c_str()) : atoi(strCheckout.c_str());

	cache->dhdBrief = isHHmm(strDHDIn.c_str()) ? hhmmToMinutes(strDHDIn.c_str()) : atoi(strDHDIn.c_str());
	cache->dhdDebrief = isHHmm(strDHDOut.c_str()) ? hhmmToMinutes(strDHDOut.c_str()) : atoi(strDHDOut.c_str());

	cache->gtBrief = isHHmm(strGTIn.c_str()) ? hhmmToMinutes(strGTIn.c_str()) : atoi(strGTIn.c_str());
	cache->gtDebrief = isHHmm(strGTOut.c_str()) ? hhmmToMinutes(strGTOut.c_str()) : atoi(strGTOut.c_str());

	cache->otherBrief = isHHmm(strOIn.c_str()) ? hhmmToMinutes(strOIn.c_str()) : atoi(strOIn.c_str());
	cache->otherDebrief = isHHmm(strOOut.c_str()) ? hhmmToMinutes(strOOut.c_str()) : atoi(strOOut.c_str());

	cache->pickup = isHHmm(strPickup.c_str()) ? hhmmToMinutes(strPickup.c_str()) : atoi(strPickup.c_str());
	cache->dropoff = isHHmm(strDropoff.c_str()) ? hhmmToMinutes(strDropoff.c_str()) : atoi(strDropoff.c_str());

	return cache;
}


//2124
shared_ptr<ruleParams> parseRuleParam2124(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strComposition, isDelay, isCrossMdn, strBunk = "*", strLandingLower, strLandingUpper, strBLHLower, strBLHUpper, strFDPLower, strFDPUpper, strMinRest, assignment;
	string attributes = "*";
	string strDPLower = "00:00";
	string strDPUpper = "99:59";
	string strFleets, strSubFleets;
	
	PARSE_RULE_PARAM(func, parameter,"COMPOSITION",strComposition,true,false);
	
	if (parameter.find("WITH_BUNK") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "WITH_BUNK", strBunk, true, false);
	}
	else if (parameter.find("WITH BUNK") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "WITH BUNK", strBunk, true, false);
	}

	if (parameter.find("LANDING_TIMES_LOWER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "LANDING_TIMES_LOWER", strLandingLower, true, false);
	}
	else if (parameter.find("LANDING TIMES LOWER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "LANDING TIMES LOWER", strLandingLower, true, false);
	}

	if (parameter.find("LANDING_TIMES_UPPER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "LANDING_TIMES_UPPER", strLandingUpper, true, false);
	}
	else if (parameter.find("LANDING TIMES UPPER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "LANDING TIMES UPPER", strLandingUpper, true, false);
	}

	PARSE_RULE_PARAM(func, parameter,"BLH LOWER",strBLHLower,true,false);
	PARSE_RULE_PARAM(func, parameter,"BLH UPPER",strBLHUpper,true,false);
	PARSE_RULE_PARAM(func, parameter,"FDP LOWER",strFDPLower,true,false);
	PARSE_RULE_PARAM(func, parameter,"FDP UPPER",strFDPUpper,true,false);
	PARSE_RULE_PARAM(func, parameter,"FDP UPPER",strFDPUpper,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS CROSS MIDNIGHT",isCrossMdn,true,false);
	PARSE_RULE_PARAM(func, parameter,"IS DELAY",isDelay,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN REST",strMinRest,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENTS",assignment,true,false);
	if (parameter.find("ATTRIBUTES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "ATTRIBUTES", attributes, true, false);
	}
	if (parameter.find("DP LOWER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DP LOWER", strDPLower, true, false);
	}
	if (parameter.find("DP UPPER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DP UPPER", strDPUpper, true, false);
	}
	PARSE_RULE_PARAM(func, parameter, "FLEETS", strFleets, true, false);
	PARSE_RULE_PARAM(func, parameter, "SUB FLEETS", strSubFleets, true, false);

	shared_ptr<rule2124> cache = shared_ptr<rule2124>(new rule2124);
	cache->composition = strComposition;
	cache->bunk = strBunk;
	cache->landingLower = strLandingLower == "*" ? 0 :atoi(strLandingLower.c_str());
	cache->landingUpper = strLandingUpper == "*" ? 99 : atoi(strLandingUpper.c_str());
	cache->blhLower = hhmmToMinutes(strBLHLower.c_str());
	cache->blhUpper = hhmmToMinutes(strBLHUpper.c_str());
	cache->fdpLower = hhmmToMinutes(strFDPLower.c_str());
	cache->fdpUpper = hhmmToMinutes(strFDPUpper.c_str());
	cache->crossMidnight = isCrossMdn;
	cache->delayed = isDelay;
	cache->minRest = hhmmToMinutes(strMinRest.c_str());
	split(assignment.c_str(), '|', cache->assignments);
	split(attributes.c_str(), '|', cache->attributes);
	cache->dpLower = hhmmToMinutes(strDPLower.c_str());
	cache->dpUpper = hhmmToMinutes(strDPUpper.c_str());

	if (!strFleets.empty() && strFleets != "*")
		split(strFleets.c_str(), '|', cache->fleets);

	if (!strSubFleets.empty() && strSubFleets != "*")
		split(strSubFleets.c_str(), '|', cache->subFleets);

	return cache;
}
//8115
shared_ptr<ruleParams> parseRuleParam8115(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string base, rank, fleet, dutyAssignments, maxTimezoneGap, vrAddMaxConseutiveTime, maxConseutiveTime, Unit;
	string lastDayMaxSta, nextDayExtension;

	PARSE_RULE_PARAM(func, parameter,"BASE",base,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",rank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",fleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"DUTY ASSIGNMENTS",dutyAssignments,true,false);
	PARSE_RULE_PARAM(func, parameter,"VR_ADD MAX CONSECUTIVE TIME",vrAddMaxConseutiveTime,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX CONSECUTIVE TIME",maxConseutiveTime,true,false);
	PARSE_RULE_PARAM(func, parameter,"UNIT",Unit,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX TIMEZONE GAP",maxTimezoneGap,true,false);
	if (parameter.find("LAST_DAY_MAX_STA") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "LAST_DAY_MAX_STA", lastDayMaxSta, true, false);
	}
	if (parameter.find("NEXT_DAY_EXTENSION") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "NEXT_DAY_EXTENSION", nextDayExtension, true, false);
	}

	
	shared_ptr<rule8115> cache = shared_ptr<rule8115>(new rule8115);
	cache->base = base;
	cache->rank = rank;
	cache->fleet = fleet;
	split(dutyAssignments.c_str(), '|', cache->dutyAssignments);
	cache->vrAddMaxConseutiveTime = atoi(vrAddMaxConseutiveTime.c_str());
	cache->maxConseutiveTime = atoi(maxConseutiveTime.c_str());
	cache->maxTimezoneGap = atoi(maxTimezoneGap.c_str());
	cache->Unit = Unit;
	cache->lastDayMaxSta = lastDayMaxSta;
	cache->nextDayExtension = nextDayExtension;
	return cache;
}

//8116
shared_ptr<ruleParams> parseRuleParam8116(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string base, rank, fleet, team, Unit, maxAbroadDays, defaultOutOfBase, defaultReturnBase, ignoreReturnBase;

	PARSE_RULE_PARAM(func, parameter,"BASE",base,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANK",rank,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEET",fleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"TEAM", team,true,false);
	PARSE_RULE_PARAM(func, parameter, "UNIT", Unit, true, false);
	PARSE_RULE_PARAM(func, parameter,"MAX ABROAD DAYS", maxAbroadDays,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEFAULT OUT OF BASE", defaultOutOfBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEFAULT RETURN BASE", defaultReturnBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"IGNORE RETURN BASE", ignoreReturnBase,true,false);

	
	shared_ptr<rule8116> cache = shared_ptr<rule8116>(new rule8116);
	cache->base = base;
	cache->rank = rank;
	cache->fleet = fleet;
	cache->team = team;
	cache->maxAbroadDays = atoi(maxAbroadDays.c_str());
	cache->defaultOutOfBase = atoi(defaultOutOfBase.c_str());
	cache->defaultReturnBase = atoi(defaultReturnBase.c_str());
	cache->ignoreReturnBase = atoi(ignoreReturnBase.c_str());
	cache->Unit = Unit;
	return cache;
}

//8014
shared_ptr<ruleParams> parseRuleParam8014(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	auto normalizeRuleParamValue = [](const string& value) {
		return strToUpper(trim(value));
	};
	auto splitNormalizedRuleParam = [&](const string& value, vector<string>& values) {
		vector<string> rawValues;
		split(value.c_str(), '|', rawValues);
		for (const auto& rawValue : rawValues) {
			string normalizedValue = normalizeRuleParamValue(rawValue);
			if (!normalizedValue.empty()) {
				values.push_back(normalizedValue);
			}
		}
	};
	string rRank, rFleet, rDutyGroup, rQual, rAlertBuffer, rAlertUnit, rActiveRanks,rTailNums="*",segTypes, rSerivceType = "*", rExcludeRoles = "*", rExcludeSubRoles = "*";
	string rQualFleets = "*", rQualFleetsGroup = "*", rCrewFleets = "*";
	PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",rRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTIVE RANKS",rActiveRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT FLEETS",rFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"QUALS",rQual,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT GROUPS",rDutyGroup,true,false);
	PARSE_RULE_PARAM(func, parameter,"ALERT BUFFER",rAlertBuffer,true,false);
	PARSE_RULE_PARAM(func, parameter,"ALERT UNIT",rAlertUnit,true,false);
	PARSE_RULE_PARAM(func, parameter,"REGISTERS",rTailNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"SEG TYPES",segTypes,true,false);
	PARSE_RULE_PARAM(func, parameter,"SERVICE TYPE",rSerivceType,true,false);
	PARSE_RULE_PARAM(func, parameter,"EXCLUDE ROLES", rExcludeRoles,true,false);
	PARSE_RULE_PARAM(func, parameter,"EXCLUDE SUBROLES", rExcludeSubRoles,true,false);
	if (parameter.find("QUAL FLEETS") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "QUAL FLEETS", rQualFleets, true, false);
	}
	if (parameter.find("QUAL FLEET GROUPS") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "QUAL FLEET GROUPS", rQualFleetsGroup, true, false);
	}
	if (parameter.find("CREW FLEETS") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "CREW FLEETS", rCrewFleets, true, false);
	}

	shared_ptr<rule8014> cache = shared_ptr<rule8014>(new rule8014);
	split(rQual.c_str(), '|', cache->qualifications);
	split(rFleet.c_str(), '|', cache->fleets);
	split(rDutyGroup.c_str(), '|', cache->assignmentGroups);
	split(rRank.c_str(), '|', cache->actingRanks);
	splitNormalizedRuleParam(rQualFleets, cache->qualFleets);
	splitNormalizedRuleParam(rQualFleetsGroup, cache->qualFleetsGroups);
	splitNormalizedRuleParam(rCrewFleets, cache->crewFleets);
	split(rTailNums.c_str(), '|', cache->tailNumbers);
	split(segTypes.c_str(), '|', cache->segTypes);
	split(rExcludeRoles.c_str(), '|', cache->excludeRoles);
	split(rExcludeSubRoles.c_str(), '|', cache->excludeSubRoles);
	cache->rRank = rRank;
	cache->rTailNums = rTailNums;
	cache->rActiveRanks = rActiveRanks;
	cache->rFleet = rFleet;
	cache->rQual = rQual;
	cache->rQualFleets = normalizeRuleParamValue(rQualFleets);
	cache->rQualFleetsGroup = normalizeRuleParamValue(rQualFleetsGroup);
	cache->rCrewFleets = normalizeRuleParamValue(rCrewFleets);
	cache->rDutyGroup = rDutyGroup;
	cache->rAlertBuffer = rAlertBuffer;
	cache->rAlertUnit = rAlertUnit;
	cache->rServiceType = rSerivceType;
	cache->iBuffer = atoi(rAlertBuffer.c_str());
	cache->rExcludeRoles = rExcludeRoles;
	cache->rExcludeSubRoles = rExcludeSubRoles;

	return cache;
}

//2109
shared_ptr<ruleParams> parseRuleParam2109(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	shared_ptr<rule2109> cache = shared_ptr<rule2109>(new rule2109);
	if (item.params.size() != 4){
		return cache;
	}

	//20190509 zheming.zhang, mantis#5483, 法规数据格式变更, 原参数项移入table2， 新增加table1
	string maxTimesPerDuty, maxTimesPerPairing, allowedStartTime, allowedEndTime;
	string inbound, outbound, maxRestTimeMinStr, minRestTimeMinStr;
	if (item.tableNum == 1){		
		PARSE_RULE_PARAM(func, parameter,"MAX TIMES PER DUTY",maxTimesPerDuty,true,false);
		PARSE_RULE_PARAM(func, parameter,"MAX TIMES PER PAIRING",maxTimesPerPairing,true,false);
		PARSE_RULE_PARAM(func, parameter,"ALLOWED START TIME",allowedStartTime,true,false);
		PARSE_RULE_PARAM(func, parameter,"ALLOWED END TIME",allowedEndTime,true,false);

	}
	else{
		PARSE_RULE_PARAM(func, parameter,"INBOUND",inbound,true,false);
		PARSE_RULE_PARAM(func, parameter,"OUTBOUND",outbound,true,false);
		PARSE_RULE_PARAM(func, parameter,"MAX REST TIME",maxRestTimeMinStr,true,false);
		PARSE_RULE_PARAM(func, parameter,"MIN REST TIME",minRestTimeMinStr,true,false);

	}

	cache->maxTimesPerDuty = maxTimesPerDuty;
	cache->maxTimesPerPairing = maxTimesPerPairing;
	cache->allowedStartTime = allowedStartTime;
	cache->allowedEndTime = allowedEndTime;

	cache->inbound = inbound;
	cache->outbound = outbound;
	cache->maxRestTimeMins = hhmmToMinutes(maxRestTimeMinStr.c_str());
	cache->minRestTimeMins = hhmmToMinutes(minRestTimeMinStr.c_str());
	return cache;
}

//mantis#2111, 预处理解析8071
shared_ptr<ruleParams> parseRuleParam8071(DBRule& item) {

	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string rBases, rRanks, rFleets, rLabels, rPeriod, rAttributes, rGroups, rQualifiers, rDests, rUnit, rMax, rMin,rTeams="*",rFlights="*";
	string rCheckMode="P";
	string rPositions = "*";
	string strOverrideDutyAttributes;
	std::vector<std::string> rOverrideDutyAttributes{};
	PARSE_RULE_PARAM(func, parameter,"BASES",rBases,true,false);
	PARSE_RULE_PARAM(func, parameter,"RANKS",rRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",rFleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"LABELS",rLabels,true,false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHTS", rFlights, true, false);
	PARSE_RULE_PARAM(func, parameter,"CREW TEAMS",rTeams,true,false);
	PARSE_RULE_PARAM(func, parameter,"ATTRIBUTES",rAttributes,true,false);
	PARSE_RULE_PARAM(func, parameter,"OVERRIDE DUTY ATTRIBUTES", strOverrideDutyAttributes, true, false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT GROUPS",rGroups,true,false);
	PARSE_RULE_PARAM(func, parameter,"QUALIFIERS",rQualifiers,true,false);
	PARSE_RULE_PARAM(func, parameter,"DESTINATIONS",rDests,true,false);
	PARSE_RULE_PARAM(func, parameter,"PERIOD",rPeriod,true,false);
	PARSE_RULE_PARAM(func, parameter,"UNIT",rUnit,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX TIMES",rMax,true,true);
	PARSE_RULE_PARAM(func, parameter,"MIN TIMES",rMin,true,true);
	PARSE_RULE_PARAM(func, parameter, "CHECK MODE", rCheckMode, true, false);
	PARSE_RULE_PARAM(func, parameter, "POSITIONS", rPositions, true, false);
	if (rPositions == "")
		rPositions = "*";

	if (!strOverrideDutyAttributes.empty() && strOverrideDutyAttributes != "*") {
		split(strOverrideDutyAttributes.c_str(), '|', rOverrideDutyAttributes);
	}

	roster_space rp;
	vector<string> sBases, sRanks, sFleets, sLabels, sAssignGroups, sQualifiers, vAssignments;
	split(rLabels.c_str(), '|', rp.labels);
	split(rAttributes.c_str(), '|', rp.attributes);
	split(rGroups.c_str(), '|', rp.assignments);
	split(rQualifiers.c_str(), '|', rp.qualifiers);
	split(rDests.c_str(), '|', rp.destinations);
	split(rFlights.c_str(), '|', rp.flightNumbers);
    rp.overrideDutyAttributes = rOverrideDutyAttributes;

	shared_ptr<rule8071> cache8071 = shared_ptr<rule8071>(new rule8071);
	cache8071->rp = rp;
	cache8071->rPositions = rPositions;
	cache8071->dMin = atof(rMin.c_str());
	cache8071->dMax = atof(rMax.c_str());
	cache8071->rBases = rBases;
	cache8071->rRanks = rRanks;
	cache8071->rFleets = rFleets;
	cache8071->rTeams = rTeams;
	cache8071->rPeriod = rPeriod;
	cache8071->rUnit = rUnit;

	cache8071->rAttributes = rAttributes;
	cache8071->rOverrideDutyAttributes = rOverrideDutyAttributes;
	cache8071->rGroups = rGroups;
	cache8071->rQualifiers = rQualifiers;
	cache8071->rLabels = rLabels;
	cache8071->rFlightNums = rFlights;
	cache8071->rDests = rDests;
	cache8071->rCheckMode = rCheckMode;
	return cache8071;
}

//8008
//mantis#2149 解析rule 8008
shared_ptr<ruleParams> parseRuleParam8008(DBRule& item) {

	int iNumber = 0;
	int iDays = 0;
	string strCrewNation, strDest, strTypes, strUnit, strNumber, strFlightNums = "*", strDept="*",strCheckOnType="S", strNotCheckCountries = "*", strAirports = "*", strFlightFlag = "*", strRosterFlightAssignments = "*",
		strCheckCtaMcl = "*", strIgnoreCertificateForCtaMcl = "*";
	vector<string> vDocs, vFltNums;
	bool bOnlyCheckLO = false;

	map<string, string>& parameter = item.params;
	map<string, string>::iterator iter;

	int func = item.function;
	string strOnlyCheckLO;
	PARSE_RULE_PARAM(func, parameter,"CREW NATIONALITY",strCrewNation,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT NUMBERS",strFlightNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"DESTINATION COUNTRY",strDest,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPARTURE COUNTRY",strDept,true,false);
	PARSE_RULE_PARAM(func, parameter,"TRAVEL DOC TYPES",strTypes,true,false);
	PARSE_RULE_PARAM(func, parameter,"VALIDITY UNIT",strUnit,true,false);
	PARSE_RULE_PARAM(func, parameter,"NUMBER",strNumber,true,false);
	PARSE_RULE_PARAM(func, parameter, "CHECK ON TYPE(S/D/P)", strCheckOnType, true, false);
	PARSE_RULE_PARAM(func, parameter,"ONLY CHECK LAYOVER",strOnlyCheckLO,true,false);
	PARSE_RULE_PARAM(func, parameter, "NOT CHECK COUNTRIES", strNotCheckCountries, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORTS", strAirports, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHT FLAG", strFlightFlag, true, false);
	PARSE_RULE_PARAM(func, parameter, "ROSTER FLIGHT ASSIGNMENTS", strRosterFlightAssignments, true, false);
	PARSE_RULE_PARAM(func, parameter, "CHECK CTA/MCL", strCheckCtaMcl, true, false);
	PARSE_RULE_PARAM(func, parameter, "IGNORE CERTIFICATE FOR CTA/MCL", strIgnoreCertificateForCtaMcl, true, false);

	bOnlyCheckLO = (strOnlyCheckLO == "Y");
	iNumber = retriveIntFromStr(strNumber, 0);

	if (strUnit == "M") iDays = iNumber * 31;
	if (strUnit == "Y") iDays = iNumber * 365;
	if (strUnit == "D") iDays = iNumber;

	split(strTypes.c_str(), '|', vDocs);
	split(strFlightNums.c_str(), '|', vFltNums);

	shared_ptr<rule8008> cache8008 = shared_ptr<rule8008>(new rule8008);
	cache8008->days = iDays;
	split(strDest, '|',cache8008->dest);
	split(strDept, '|', cache8008->dept);
	cache8008->number = iNumber;
	cache8008->onlyCheckLo = bOnlyCheckLO;
	if (strCrewNation.find("!(") != string::npos) {
		int idx = strCrewNation.find("(");
		int length = strCrewNation.size() - 3;
		strCrewNation = strCrewNation.substr(idx + 1, length);
		split(strCrewNation, '|', cache8008->exceptionCrewNation);
	}
	else {
		split(strCrewNation, '|', cache8008->strCrewNation);
	}
	cache8008->types = strTypes;
	cache8008->unit = strUnit;
	cache8008->strFltNums = strFlightNums;
	cache8008->vDocs.insert(cache8008->vDocs.end(), vDocs.begin(), vDocs.end());
	cache8008->vFltNums.insert(cache8008->vFltNums.end(), vFltNums.begin(), vFltNums.end());
	cache8008->checkonType = strCheckOnType;
	split(strAirports, '|', cache8008->airports);
	for (string& fltNum : cache8008->vFltNums) {
		cache8008->mFltNums[fltNum] = true;
	}
	for (string& doc : cache8008->vDocs) {
		cache8008->mDocs[doc] = true;
	}
	if (!strNotCheckCountries.empty() && strNotCheckCountries != "*") {
		split(strNotCheckCountries, '|', cache8008->notCheckCountries);
	}
	cache8008->flightFlag = strFlightFlag;
	cache8008->rosterFlightAssignments = strRosterFlightAssignments;
	cache8008->checkCtaOrMcl = strCheckCtaMcl;
	split(strIgnoreCertificateForCtaMcl, '|', cache8008->ignoreCertificatesForCtaOrMcl);
	return cache8008;
}

//8028
shared_ptr<ruleParams> parseRuleParam8028(DBRule& item) {

	string strCrewNation = "*", strFlightNums = "*", strFltCountries = "*", strFltTypes = "*";

	map<string, string>& parameter = item.params;
	map<string, string>::iterator iter;

	int func = item.function;
	PARSE_RULE_PARAM(func, parameter, "CREW NATIONALITIES", strCrewNation, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHT NUMBERS", strFlightNums, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHT COUNTRIES", strFltCountries, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHT TYPES", strFltTypes, true, false);
	
	shared_ptr<rule8028> cache8028 = std::make_shared<rule8028>();
	split(strCrewNation, '|', cache8028->crewNationalities);
	split(strFlightNums, '|', cache8028->fltNums);
	split(strFltCountries, '|', cache8028->fltCountries);
	split(strFltTypes, '|', cache8028->fltTypes);
	return cache8028;
}

shared_ptr<ruleParams> parseRuleParam2003(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter) {
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	auto parseUpperList = [](const string& raw, vector<string>& out) {
		out.clear();
		string normalized = strToUpper(trim(raw));
		if (normalized.empty() || normalized == "*") {
			return;
		}
		vector<string> values;
		split(raw, '|', values);
		for (const auto& value : values) {
			string token = strToUpper(trim(value));
			if (!token.empty() && token != "*") {
				out.push_back(token);
			}
		}
	};
	//
	//retrive param
	string base;
	string maxPgLength;
	string maxDutiesinPG;
	string allowReturnBaseinDuty;
	string strmaxBlh;
	string strMaxDays;//calendars
	string allowableLayoverStation;
	string fleets;
	string fleetGroup;
	
	PARSE_RULE_PARAM(func, parameter, "BASE", base, true, false);
	PARSE_RULE_PARAM(func, parameter, "MAXPAIRINGLENGTH", maxPgLength, true, true);
	PARSE_RULE_PARAM(func, parameter, "MAXNRDUTIESINPAIRING", maxDutiesinPG, true, true);
	PARSE_RULE_PARAM(func, parameter, "ALLOWRETURNBASEWITHINDUTY", allowReturnBaseinDuty, true, false);
	PARSE_RULE_PARAM(func, parameter, "MAXPAIRINGBLH", strmaxBlh, true, false);//hh:mm
	PARSE_RULE_PARAM(func, parameter, "MAXPAIRINGCALENDARDAYS", strMaxDays, true, true);
	PARSE_RULE_PARAM(func, parameter, "ALLOWABLE LAYOVER STATIONS", allowableLayoverStation, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEETS", fleets, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEET GROUP", fleetGroup, true, false);
	
	shared_ptr<rule2003> cache = shared_ptr<rule2003>(new rule2003);
	cache->base = base;
	cache->maxPgLength = maxPgLength == "*" ? 9999 : atoi(maxPgLength.c_str());
	cache->maxDutiesinPG = maxDutiesinPG == "*" ? 99 : atoi(maxDutiesinPG.c_str());
	cache->allowReturnBaseinDuty = allowReturnBaseinDuty;
	cache->maxBlh = strmaxBlh;
	cache->strMaxDays = strMaxDays;
	split(allowableLayoverStation, '|', cache->allowableLayoverStation);
	parseUpperList(fleets, cache->fleets);
	parseUpperList(fleetGroup, cache->fleetGroups);

	return cache;
}

shared_ptr<ruleParams> parseRuleParam2004(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter;
	auto replaceAll = [](string& target, const string& from, const string& to) {
		if (from.empty()) return;
		std::size_t pos = 0;
		while ((pos = target.find(from, pos)) != string::npos) {
			target.replace(pos, from.length(), to);
			pos += to.length();
		}
	};
	auto normalizeKey = [&](string key) {
		key = strToUpper(key);
		key.erase(remove_if(key.begin(), key.end(), [](char c) { return c == ' ' || c == '_' || c == '-'; }), key.end());
		replaceAll(key, "NUMBER", "NR");
		replaceAll(key, "NUM", "NR");
		replaceAll(key, "OF", "");
		replaceAll(key, "THRESHOLD", "THREDHOLD");
		replaceAll(key, "AIRCRAFTCHANGES", "AIRCRAFTCHANGS");
		// New alias for "maxFlightBLHAllowDHD" (rule2004):
		// parameter display might use "Flight Time" instead of legacy "Flight BLH".
		if (key == "MAXFLIGHTTIMEALLOWDHD") {
			return string("MAXFLIGHTBLHALLOWDHD");
		}
		// New alias for "maxFlyTimeInDuty" (rule2004):
		// accept "Max Flight Time In Duty" as a synonym for legacy "Max Fly Time In Duty".
		if (key == "MAXFLIGHTTIMEINDUTY") {
			return string("MAXFLYTIMEINDUTY");
		}
		// New alias for "isDutyBelongToDifferentDayChecked" (rule2004):
		// "Duties Must Start on Different Day" = Y means two duties cannot start on the same calendar day (base timezone).
		if (key == "DUTIESMUSTSTARTONDIFFERENTDAY") {
			return string("ISDUTYBELONGTODIFFERENTDAYCHECKED");
		}
		return key;
	};
	for (auto& p : item.params) {		
		parameter.insert(pair<string, string>(normalizeKey(p.first), p.second));
	}
	string maxNrFlySegsInDuty;
	string maxNrNonoperateLegsInDuty;
	string maxNrAircraftChangeInDuty;
	string maxNrConsecutiveDhd;
	string maxNrDHDInDuty;
	string isDhdAllowedInMiddleDuty;
	string isDutySegmentsInSameCalendarDay;
	string maxNrGRDCommuteInDuty;
	string isDutyBelongToDifferentDayChecked;
	string maxNrAircraftchangsAndLTInDuty;
	string isDHDmustBetweenBaseAndLOStation;
	string totalSegsInDuty;
	string maxFlightBLHAllowDHD;
	string isInternationalDHDallowed;
	string overNightFlyThredhold;
	string maxDutyDP;
	string maxFlyTimeInDuty;
	string pureDeadheadDutyAllowed;
	string maxFdpWithAircraftChange;
	PARSE_RULE_PARAM(func, parameter,"OVERNIGHTFLYTHREDHOLD",overNightFlyThredhold,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRFLYSEGSINDUTY",maxNrFlySegsInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRNONOPERATELEGSINDUTY",maxNrNonoperateLegsInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRAIRCRAFTCHANGEINDUTY",maxNrAircraftChangeInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRCONSECUTIVEDHD",maxNrConsecutiveDhd,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRDHDINDUTY",maxNrDHDInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISDHDALLOWEDINMIDDLEDUTY",isDhdAllowedInMiddleDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISDUTYSEGMENTSINSAMECALENDARDAY",isDutySegmentsInSameCalendarDay,true,false);
	PARSE_RULE_PARAM(func, parameter,"TOTALSEGSINDUTY",totalSegsInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISDUTYBELONGTODIFFERENTDAYCHECKED",isDutyBelongToDifferentDayChecked,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISDHDMUSTBETWEENBASEANDLOSTATION",isDHDmustBetweenBaseAndLOStation,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISINTERNATIONALDHDALLOWED",isInternationalDHDallowed,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRGRDCOMMUTEINDUTY",maxNrGRDCommuteInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXNRAIRCRAFTCHANGSANDLTINDUTY",maxNrAircraftchangsAndLTInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXFLIGHTBLHALLOWDHD",maxFlightBLHAllowDHD,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXDUTYDP",maxDutyDP,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXFLYTIMEINDUTY",maxFlyTimeInDuty,true,false);
	PARSE_RULE_PARAM(func, parameter,"PUREDEADHEADDUTYALLOWED",pureDeadheadDutyAllowed,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAXFDPWITHAIRCRAFTCHANGE",maxFdpWithAircraftChange,true,false);

	if (maxFlyTimeInDuty == "" || maxFlyTimeInDuty == "*")
		maxFlyTimeInDuty = "999:00";
	if (pureDeadheadDutyAllowed == "")
		pureDeadheadDutyAllowed = "Y";
	if (maxFdpWithAircraftChange == "" || maxFdpWithAircraftChange == "*")
		maxFdpWithAircraftChange = "999:00";
	if (maxDutyDP == "" || maxDutyDP == "*")
		maxDutyDP = "999:00";
	if (maxFlightBLHAllowDHD == "" || maxFlightBLHAllowDHD == "*")
		maxFlightBLHAllowDHD = "999:00";
	shared_ptr<rule2004> cache = shared_ptr<rule2004>(new rule2004);
	cache->maxNrFlySegsInDuty = maxNrFlySegsInDuty;
	cache->maxNrNonoperateLegsInDuty = maxNrNonoperateLegsInDuty;
	cache->maxNrAircraftChangeInDuty = maxNrAircraftChangeInDuty;
	cache->maxNrConsecutiveDhd = maxNrConsecutiveDhd;
	cache->maxNrDHDInDuty = maxNrDHDInDuty;
	cache->isDhdAllowedInMiddleDuty = isDhdAllowedInMiddleDuty;
	cache->isDutySegmentsInSameCalendarDay = isDutySegmentsInSameCalendarDay;
	cache->maxNrGRDCommuteInDuty = maxNrGRDCommuteInDuty;
	cache->isDutyBelongToDifferentDayChecked = isDutyBelongToDifferentDayChecked;
	cache->maxNrAircraftchangsAndLTInDuty = maxNrAircraftchangsAndLTInDuty;
	cache->isDHDmustBetweenBaseAndLOStation = isDHDmustBetweenBaseAndLOStation;
	cache->totalSegsInDuty = totalSegsInDuty;
	cache->maxFlightBLHAllowDHD = maxFlightBLHAllowDHD;
	cache->isInternationalDHDallowed = isInternationalDHDallowed;
	cache->overNightFlyThredhold = overNightFlyThredhold;
	cache->maxDutyDP = maxDutyDP;
	cache->maxFlyTimeInDuty = maxFlyTimeInDuty;
	cache->pureDeadheadDutyAllowed = strToUpper(pureDeadheadDutyAllowed);
	cache->maxFdpWithAircraftChange = maxFdpWithAircraftChange;

	return cache;
}

shared_ptr<ruleParams> parseRuleParam8114(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string activeRanks, actingRanks, flightFleets, fleetSpecific, assignmentGroups, exceptionCode;
	PARSE_RULE_PARAM(func, parameter,"ACTIVE RANKS",activeRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"ACTING RANKS",actingRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT FLEETS",flightFleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETSPECIFIC",fleetSpecific,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT GROUPS",assignmentGroups,true,false);
	PARSE_RULE_PARAM(func, parameter,"EXCEPTIONCODE",exceptionCode,true,false);

	shared_ptr<rule8114> cache = shared_ptr<rule8114>(new rule8114);
	split(activeRanks, '|', cache->activeRankVec);
	split(actingRanks, '|', cache->actingRankVec);
	split(assignmentGroups, '|', cache->assignmentGroupVec);
	split(flightFleets, '|', cache->flightFleetVec);
	cache->fleetSpecific = fleetSpecific;
	cache->exceptionCode = exceptionCode;
	return cache;
}

shared_ptr<ruleParams> parseRuleParam8092(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string CrewANalities, CrewABase, CrewARanks, CrewAFleet, CrewAActingRank,CrewAAge,CrewATeam,
		CrewBNalities, CrewBBase, CrewBRanks, CrewBFleet, CrewBQualification,CrewBAge,CrewBTeam,
		MinLimits, MaxLimits,division,
		FlightAssignment, alertMessage, Attributes = "*";
	PARSE_RULE_PARAM(func, parameter,"CREW A NATIONALITIES",CrewANalities,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A BASE",CrewABase,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A AGE",CrewAAge,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A RANK",CrewARanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A FLEET",CrewAFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A ACTING RANK",CrewAActingRank,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW A TEAM",CrewATeam,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B NATIONALITIES",CrewBNalities,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B BASE",CrewBBase,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B AGE",CrewBAge,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B RANK",CrewBRanks,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B FLEET",CrewBFleet,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B QUALIFICATION",CrewBQualification,true,false);
	PARSE_RULE_PARAM(func, parameter,"CREW B TEAM",CrewBTeam,true,false);
	PARSE_RULE_PARAM(func, parameter,"MIN LIMITS",MinLimits,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX LIMITS",MaxLimits,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLIGHT ASSIGNMENT",FlightAssignment,true,false);
	PARSE_RULE_PARAM(func, parameter,"ALERT MESSAGE",alertMessage,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIVISION",division,true,false);
	if (parameter.find("ATTRIBUTES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "ATTRIBUTES", Attributes, true, false);
	}

	shared_ptr<rule8092> cache = shared_ptr<rule8092>(new rule8092);
	split(CrewANalities, '|', cache->CrewANalitiesVec);
	split(CrewABase, '|', cache->CrewABaseVec);
	split(CrewAAge, '-', cache->CrewAAgeVec);
	if (CrewAAge != "*" && (cache->CrewAAgeVec.size() < 2 || !isNumberStr(cache->CrewAAgeVec[0].c_str(), cache->CrewAAgeVec[0].length()) || !isNumberStr(cache->CrewAAgeVec[1].c_str(), cache->CrewAAgeVec[1].length()))) {
		cout << "ERROR: invalid rule_param, func=" << func << " ,paramName= CREW A AGE , value= " << CrewAAge << ", is wrong format;" << endl;
	}
	split(CrewARanks, '|', cache->CrewARanksVec);
	split(CrewAFleet, '|', cache->CrewAFleetVec);
	split(CrewAActingRank, '|', cache->CrewAActingRankVec);
	split(CrewATeam, '|', cache->CrewATeamVec);
	split(CrewBNalities, '|', cache->CrewBNalitiesVec);
	split(CrewBBase, '|', cache->CrewBBaseVec);
	split(CrewBAge, '-', cache->CrewBAgeVec);
	if (CrewBAge != "*" && (cache->CrewBAgeVec.size() < 2 || !isNumberStr(cache->CrewBAgeVec[0].c_str(), cache->CrewBAgeVec[0].length()) || !isNumberStr(cache->CrewBAgeVec[1].c_str(), cache->CrewBAgeVec[1].length()))) {
		cout << "ERROR: invalid rule_param, func=" << func << " ,paramName= CREW B AGE , value= " << CrewBAge << ", is wrong format;" << endl;
	}
	split(CrewBRanks, '|', cache->CrewBRanksVec);
	split(CrewBFleet, '|', cache->CrewBFleetVec);
	split(CrewBQualification, '|', cache->CrewBQualificationVec);
	split(CrewBTeam, '|', cache->CrewBTeamVec);
	cache->MinLimits = atoi(MinLimits.c_str());
	cache->MaxLimits = atoi(MaxLimits.c_str());
	cache->alertMessage = alertMessage;
	split(division, '|', cache->divisionVec);
	split(FlightAssignment, '|', cache->FlightAssignmentVec);
	split(Attributes, '|', cache->AttributesVec);
	return cache;
}
shared_ptr<ruleParams> parseRuleParam2030(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string composition,fleets, division, maxFdp,augment,maxExtension;
	PARSE_RULE_PARAM(func, parameter,"FLEETS",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"COMPOSITION",composition,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIVISION",division,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX FDP",maxFdp,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISAUGMENT",augment,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX EXTENSION",maxExtension,true,false);

	shared_ptr<rule2030_2> cache = shared_ptr<rule2030_2>(new rule2030_2);
	split(fleets, '|', cache->fleetsVec);
	cache->composition = composition;
	cache->division = division;
	cache->maxFdp = hhmmStrToMinutes(maxFdp) * 60;
	cache->maxExtension = hhmmStrToMinutes(maxExtension) * 60;
	cache->isAugment = augment == "Y";
	return cache;
}
shared_ptr<ruleParams> parseRuleParam2130(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string crewNums, fleets, division, maxFdp, augment, maxExtension;
	if (parameter.find("FLEETS") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "FLEETS", fleets, true, false);
	}
	else {
		PARSE_RULE_PARAM(func, parameter, "FLEET", fleets, true, false);
	}
	PARSE_RULE_PARAM(func, parameter,"CREW NUMS",crewNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"DIVISION",division,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX FDP",maxFdp,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISAUGMENT",augment,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX EXTENSION",maxExtension,true,false);

	shared_ptr<rule2130> cache = shared_ptr<rule2130>(new rule2130);
	split(fleets, '|', cache->fleetsVec);
	cache->composition = crewNums;
	cache->crewNums = atoi(crewNums.c_str());
	cache->division = division;
	cache->maxFdp = hhmmStrToMinutes(maxFdp) * 60;
	cache->maxExtension = hhmmStrToMinutes(maxExtension) * 60;
	cache->isAugment = augment == "Y";
	return cache;
}

shared_ptr<ruleParams> parseRuleParam3021(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string airport,depStart,depEnd,dutyType,fltNums,fleets,assignment;
	string division = "*";
	string airlines = "*";
	string isTraining = "*";
	string briefTime, effDate, expDate;
	string dutyAssignments = "*";
	string courses = "*";
	string endAirport = "*";
	string dutyBlhRange = "*";
	string sectorBlhRange = "*";
	string pairingBases = "*";
	string routes = "*";
	string maxFdpBrief = "*";
	PARSE_RULE_PARAM(func, parameter,"AIRPORT",airport,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPSTART",depStart,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPEND",depEnd,true,false);

	if (parameter.find("DUTY TYPE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DUTY TYPE",dutyType,true,false);
	}
	else if (parameter.find("DIR") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DIR",dutyType,true,false);
	}

	PARSE_RULE_PARAM(func, parameter,"FLT NUMS",fltNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT",assignment,true,false);
	if (parameter.find("DIVISION") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DIVISION", division, true, false);
	}
	if (parameter.find("AIRLINES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "AIRLINES", airlines, true, false);
	}
	if (parameter.find("IS TRAINING") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS TRAINING", isTraining, true, false);
	}
	PARSE_RULE_PARAM(func, parameter,"BRIEF TIME",briefTime,true,false);
	if (parameter.find("MAX FDP BRIEF") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "MAX FDP BRIEF", maxFdpBrief, true, false);
	}
	if (parameter.find("EFFECTIVE DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EFFECTIVE DATE", effDate, true, false);
	}
	if (parameter.find("EXPIRED DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EXPIRED DATE", expDate, true, false);
	}
	if (parameter.find("DUTY ASSIGNMENTS") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DUTY ASSIGNMENTS", dutyAssignments, true, false);
	}
	if (parameter.find("COURSES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "COURSES", courses, true, false);
	}
	if (parameter.find("END AIRPORT") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "END AIRPORT", endAirport, true, false);
	}
	if (parameter.find("DUTY BLH RANGE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "DUTY BLH RANGE", dutyBlhRange, true, false);
	}
	if (parameter.find("SECTOR BLH RANGE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "SECTOR BLH RANGE", sectorBlhRange, true, false);
	}
	if (parameter.find("ROUTES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "ROUTES", routes, true, false);
	}
	if (parameter.find("PAIRING BASES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "PAIRING BASES", pairingBases, true, false);
	}	
	shared_ptr<rule3021> cache = shared_ptr<rule3021>(new rule3021);
	cache->division = strToUpper(trim(division));
	cache->airport = airport;
	cache->depStart = hhmmStrToMinutes(depStart) * 60;
	cache->depEnd = hhmmStrToMinutes(depEnd) * 60;
	cache->dutyType = dutyType;
	split(fltNums, '|', cache->fltNumsVec);
	split(fleets, '|', cache->fleetsVec);
	split(assignment, '|', cache->assignment);
	split(dutyAssignments, '|', cache->dutyAssignments);
	split(airlines, '|', cache->airlines);
	cache->isTraining = (isTraining == "*") ? nullptr : std::make_shared<bool>(strToUpper(isTraining) == "Y");
	cache->briefTime = hhmmStrToMinutes(briefTime);
	cache->maxFdpBriefTime = (maxFdpBrief.empty() || maxFdpBrief == "*") ? -1 : hhmmStrToMinutes(maxFdpBrief);
	cache->effDate = (effDate.empty() || effDate == "*") ? -1 : utcStrToUtc((char*)effDate.c_str());
	cache->expDate = (expDate.empty() || expDate == "*") ? -1 : utcStrToUtc((char*)expDate.c_str());
	split(courses, '|', cache->courses);
	cache->endAirport = endAirport;
	if (dutyBlhRange.find("-") != string::npos) {
		vector<string> blhRangeVec;
		split(dutyBlhRange, '-', blhRangeVec);
		if (blhRangeVec.size() == 2) {
			cache->dutyBlhRangeLower = hhmmStrToMinutes(blhRangeVec[0]);
			cache->dutyBlhRangeUpper = hhmmStrToMinutes(blhRangeVec[1]);
		}
	
	}
	if (sectorBlhRange.find("-") != string::npos) {
		vector<string> blhRangeVec;
		split(sectorBlhRange, '-', blhRangeVec);
		if (blhRangeVec.size() == 2) {
			cache->sectorBlhRangeLower = hhmmStrToMinutes(blhRangeVec[0]);
			cache->sectorBlhRangeUpper = hhmmStrToMinutes(blhRangeVec[1]);
		}
	}

	if (!routes.empty() && routes != "*") {
		split(routes, '|', cache->routes);
	}

	if (!pairingBases.empty() && pairingBases != "*") {
		split(pairingBases, '|', cache->pairingBases);
	}
	return cache;
}

shared_ptr<ruleParams> parseRuleParam3022(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string airport, dutyType, fltNums, fleets, assignment;
	string airlines = "*";
	string isTraining = "*";
	string debriefTime, effDate, expDate;
	string courses = "*";
	string pairingBases = "*";
	PARSE_RULE_PARAM(func, parameter,"AIRPORT",airport,true,false);
	
	if (parameter.find("DUTY TYPE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DUTY TYPE",dutyType,true,false);
	}
	else if (parameter.find("DIR") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DIR",dutyType,true,false);
	}

	PARSE_RULE_PARAM(func, parameter,"FLT NUMS",fltNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT",assignment,true,false);
	if (parameter.find("AIRLINES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "AIRLINES", airlines, true, false);
	}
	if (parameter.find("IS TRAINING") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS TRAINING", isTraining, true, false);
	}
	PARSE_RULE_PARAM(func, parameter,"DEBRIEF TIME",debriefTime,true,false);
	if (parameter.find("EFFECTIVE DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EFFECTIVE DATE", effDate, true, false);
	}
	if (parameter.find("EXPIRED DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EXPIRED DATE", expDate, true, false);
	}
	if (parameter.find("COURSES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "COURSES", courses, true, false);
	}
	if (parameter.find("PAIRING BASES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "PAIRING BASES", pairingBases, true, false);
	}
	shared_ptr<rule3022> cache = shared_ptr<rule3022>(new rule3022);
	cache->airport = airport;
	cache->dutyType = dutyType;
	split(fltNums, '|', cache->fltNumsVec);
	split(fleets, '|', cache->fleetsVec);
	split(assignment, '|', cache->assignment);
	split(airlines, '|', cache->airlines);
	cache->isTraining = (isTraining == "*") ? nullptr : std::make_shared<bool>(strToUpper(isTraining) == "Y");
	cache->debriefTime = hhmmStrToMinutes(debriefTime);
	cache->effDate = (effDate.empty() || effDate == "*") ? -1 : utcStrToUtc((char*)effDate.c_str());
	cache->expDate = (expDate.empty() || expDate == "*") ? -1 : utcStrToUtc((char*)expDate.c_str());
	split(courses, '|', cache->courses);

	if (!pairingBases.empty() && pairingBases != "*") {
		split(pairingBases, '|', cache->pairingBases);
	}
	return cache;

}

shared_ptr<ruleParams> parseRuleParam3023(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string pairingBases = "*", strIsLayover;
	string airport, depStart, depEnd, dutyType, fltNums, fleets, assignment;
	string airlines = "*";
	string pickupTime, effDate, expDate;
	if (parameter.find("PAIRING BASES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "PAIRING BASES", pairingBases, true, false);
	}

	if (parameter.find("IS LAYOVER(Y/N)") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS LAYOVER(Y/N)", strIsLayover, true, false);
	}
	else if (parameter.find("IS LAYOVER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS LAYOVER", strIsLayover, true, false);
	}

	PARSE_RULE_PARAM(func, parameter,"AIRPORT",airport,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPSTART",depStart,true,false);
	PARSE_RULE_PARAM(func, parameter,"DEPEND",depEnd,true,false);
	
	if (parameter.find("DUTY TYPE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DUTY TYPE",dutyType,true,false);
	}
	else if (parameter.find("DIR") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DIR",dutyType,true,false);
	}

	PARSE_RULE_PARAM(func, parameter,"FLT NUMS",fltNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT",assignment,true,false);
	if (parameter.find("AIRLINES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "AIRLINES", airlines, true, false);
	}
	PARSE_RULE_PARAM(func, parameter,"PICKUP TIME",pickupTime,true,false);
	if (parameter.find("EFFECTIVE DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EFFECTIVE DATE", effDate, true, false);
	}
	if (parameter.find("EXPIRED DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EXPIRED DATE", expDate, true, false);
	}
		
	shared_ptr<rule3023> cache = shared_ptr<rule3023>(new rule3023);
	if (!pairingBases.empty() && pairingBases != "*") {
		split(pairingBases, '|', cache->pairingBases);
	}
	if (!strIsLayover.empty() && strIsLayover != "*") {
		cache->isLayover = std::make_shared<bool>(strIsLayover == "Y");
	}
	cache->airport = airport;
	cache->depStart = hhmmStrToMinutes(depStart) * 60;
	cache->depEnd = hhmmStrToMinutes(depEnd) * 60;
	cache->dutyType = dutyType;
	split(fltNums, '|', cache->fltNumsVec);
	split(fleets, '|', cache->fleetsVec);
	split(assignment, '|', cache->assignment);
	split(airlines, '|', cache->airlines);
	cache->pickupTime = hhmmStrToMinutes(pickupTime);
	cache->effDate = (effDate.empty() || effDate == "*") ? -1 : utcStrToUtc((char*)effDate.c_str());
	cache->expDate = (expDate.empty() || expDate == "*") ? -1 : utcStrToUtc((char*)expDate.c_str());
	return cache;

}

shared_ptr<ruleParams> parseRuleParam3024(DBRule& item) {
	int ret = 0;
	int func = item.function;
	map<string, string> parameter = item.params;
	for (auto &p : parameter){
		parameter.insert(pair<string, string>(strToUpper(p.first), p.second));
	}
	string pairingBases = "*", strIsLayover;
	string airport, depStart, depEnd, dutyType, fltNums, fleets, assignment;
	string airlines = "*";
	string dropoffTime, effDate, expDate;
	if (parameter.find("PAIRING BASES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "PAIRING BASES", pairingBases, true, false);
	}

	if (parameter.find("IS LAYOVER(Y/N)") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS LAYOVER(Y/N)", strIsLayover, true, false);
	}
	else if (parameter.find("IS LAYOVER") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "IS LAYOVER", strIsLayover, true, false);
	}

	PARSE_RULE_PARAM(func, parameter,"AIRPORT",airport,true,false);
	
	if (parameter.find("DUTY TYPE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DUTY TYPE",dutyType,true,false);
	}
	else if (parameter.find("DIR") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter,"DIR",dutyType,true,false);
	}

	PARSE_RULE_PARAM(func, parameter,"FLT NUMS",fltNums,true,false);
	PARSE_RULE_PARAM(func, parameter,"FLEETS",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"ASSIGNMENT",assignment,true,false);
	if (parameter.find("AIRLINES") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "AIRLINES", airlines, true, false);
	}
	PARSE_RULE_PARAM(func, parameter,"DROPOFF TIME",dropoffTime,true,false);
	if (parameter.find("EFFECTIVE DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EFFECTIVE DATE", effDate, true, false);
	}
	if (parameter.find("EXPIRED DATE") != parameter.end()) {
		PARSE_RULE_PARAM(func, parameter, "EXPIRED DATE", expDate, true, false);
	}

	shared_ptr<rule3024> cache = shared_ptr<rule3024>(new rule3024);
	if (!pairingBases.empty() && pairingBases != "*") {
		split(pairingBases, '|', cache->pairingBases);
	}
	if (!strIsLayover.empty() && strIsLayover != "*") {
		cache->isLayover = std::make_shared<bool>(strIsLayover == "Y");
	}
	cache->airport = airport;
	cache->dutyType = dutyType;
	split(fltNums, '|', cache->fltNumsVec);
	split(fleets, '|', cache->fleetsVec);
	split(assignment, '|', cache->assignment);
	split(airlines, '|', cache->airlines);
	cache->dropoffTime = hhmmStrToMinutes(dropoffTime);
	cache->effDate = (effDate.empty() || effDate == "*") ? -1 : utcStrToUtc((char*)effDate.c_str());
	cache->expDate = (expDate.empty() || expDate == "*") ? -1 : utcStrToUtc((char*)expDate.c_str());
	return cache;

}

shared_ptr<ruleParams> parseRuleParam8141(DBRule & item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string bases, ranks, fleets, crewTeams, assignments, period, unit, maxTimes, minTimes;
	PARSE_RULE_PARAM(func, parameter," Bases",bases,true,false);
	PARSE_RULE_PARAM(func, parameter,"Ranks",ranks,true,false);
	PARSE_RULE_PARAM(func, parameter,"Fleets",fleets,true,false);
	PARSE_RULE_PARAM(func, parameter,"Crew Teams",crewTeams,true,false);
	PARSE_RULE_PARAM(func, parameter,"Assignments",assignments,true,false);
	PARSE_RULE_PARAM(func, parameter,"Period",period,true,false);
	PARSE_RULE_PARAM(func, parameter,"Unit",unit,true,false);
	PARSE_RULE_PARAM(func, parameter,"Max Times",maxTimes,true,false);
	PARSE_RULE_PARAM(func, parameter,"Min Times ",minTimes,true,false);

	shared_ptr<rule8141> cache = shared_ptr<rule8141>(new rule8141);
	split(bases, '|', cache->baseVec);
	split(ranks, '|', cache->rankVec);
	split(fleets, '|', cache->fleetVec);
	split(crewTeams, '|', cache->crewTeamVec);
	split(assignments, '|', cache->assignmentVec);
	cache->period = atoi(period.c_str());
	cache->unit = unit;
	cache->maxTimes = atoi(maxTimes.c_str());
	cache->minTimes = atoi(minTimes.c_str());
	return cache;
}

shared_ptr<ruleParams> parseRuleParam3007(DBRule & item) {
	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string composition, restFacility, landingLower, landingsUpper, rptStart, rptEnd, maxFdp, maxExtension, isAugment;
	PARSE_RULE_PARAM(func, parameter,"COMPOSITION",composition,true,false);
	PARSE_RULE_PARAM(func, parameter,"REST FACILITY",restFacility,true,false);
	PARSE_RULE_PARAM(func, parameter,"LANDING LOWER",landingLower,true,false);
	PARSE_RULE_PARAM(func, parameter,"LANDINGS UPPER",landingsUpper,true,false);
	PARSE_RULE_PARAM(func, parameter,"RPT START",rptStart,true,false);
	PARSE_RULE_PARAM(func, parameter,"RPT END",rptEnd,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX FDP",maxFdp,true,false);
	PARSE_RULE_PARAM(func, parameter,"MAX EXTENSION",maxExtension,true,false);
	PARSE_RULE_PARAM(func, parameter,"ISAUGMENT",isAugment,true,false);

	shared_ptr<rule3007> cache = shared_ptr<rule3007>(new rule3007);
	cache->composition = composition;
	cache->restFacility = restFacility;
	cache->landingLower = atoi(landingLower.c_str());
	cache->landingsUpper = atoi(landingsUpper.c_str());
	cache->rptStart = rptStart;
	cache->rptEnd = rptEnd;
	cache->maxFdp = hhmmStrToMinutes(maxFdp);
	cache->maxExtension = hhmmStrToMinutes(maxExtension);
	cache->isAugment = isAugment;
	return cache;
}

//8126
shared_ptr<ruleParams> parseRuleParam8126(DBRule& item) {

	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBases = "*";
	string strRanks = "*";
	string strFleets = "*";
	string strTeams = "*";
	string strPilots = "*";
	string strAttributes;
	string strFlights;
	string strAirports;
	string strCombinations;
	string strAssignments = "FLY";
	string strActingRanks = "*";

	PARSE_RULE_PARAM(func, parameter, "BASES", strBases, true, false);
	PARSE_RULE_PARAM(func, parameter, "RANKS", strRanks, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEETS", strFleets, true, false);
	PARSE_RULE_PARAM(func, parameter, "CREW TEAMS", strTeams, true, false);
	PARSE_RULE_PARAM(func, parameter, "PILOTS", strPilots, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHTS", strFlights, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORTS", strAirports, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTES", strAttributes, true, false);
	PARSE_RULE_PARAM(func, parameter, "QUAL COMBINATIONS", strCombinations, true, false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENTS", strAssignments, true, false);
	PARSE_RULE_PARAM(func, parameter, "ACTING RANKS", strActingRanks, true, false);

	shared_ptr<rule8126> cache = shared_ptr<rule8126>(new rule8126);
	cache->strBases = strBases;
	cache->strRanks = strRanks;
	cache->strFleets = strFleets;
	cache->strTeams = strTeams;
	cache->strPilots = strPilots;
	cache->strFlights = strFlights;
	cache->strAirports = strAirports;
	cache->strAttributes = strAttributes;
	cache->strCombinations = strCombinations;
	cache->strAssignments = strAssignments;
	cache->strActingRanks = strActingRanks;

	vector<string> vAirports;
	split(strAirports, '|', vAirports);
	cache->vAirports = vAirports;

	vector<string> vFlights;
	split(strFlights, '|', vFlights);
	cache->vFlights = vFlights;

	vector<string> vAttributes;
	split(strAttributes, '|', vAttributes);
	cache->vAttributes = vAttributes;

	vector<string> vRanks;
	split(strRanks, '|', vRanks);
	cache->vRanks = vRanks;

	vector<string> vAssignments;
	split(strAssignments, '|', vAssignments);
	cache->vAssignments = vAssignments;

	vector<string> vActingRanks;
	split(strActingRanks, '|', vActingRanks);
	cache->vActingRanks = vActingRanks;

	vector<string> vQualifications;
	split(strCombinations, '|', vQualifications);
	vector<vector<string>> strCheckQuals;
	for (std::size_t i = 0; i < vQualifications.size(); i++)
	{
		vector<string> strQualsTemp;
		split(vQualifications[i], '+', strQualsTemp);
		strCheckQuals.push_back(strQualsTemp);
	}
	cache->strCheckQuals = strCheckQuals;
	
	return cache;
}

//预处理8056
shared_ptr<ruleParams> parseRuleParam8056(DBRule& item) {
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBase = "*";
	string strRank = "*";
	string strFleet = "*";
	string strAttributeA = "*";
	string strAttributeB = "*";
	string strLabelA = "*";
	string strLabelB = "*";
	string strAssignmentA = "*";
	string strAssignmentB = "*";
	string strQualifierA = "*";
	string strQualifierB = "*";
	string strAEqualToBase = "*";
	string strBEqualToBase = "*";
	string strAirportsA = "*";
	string strAirportsB = "*";
	string strIsReqA;
	string strIsReqB;
	string strIsLineTrainingA = "*";
	string strIsLineTrainingB = "*";
	string strCourseCodeA = "*";
	string strCourseCodeB = "*";
	string strSpace;
	string strUnit;
	string strDirectional;
	string strUtilizePostRest;
	string strRolesA = "*";
	string strRolesB = "*";
	string strTeam = "*";

	PARSE_RULE_PARAM(func, parameter, "BASES", strBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "RANKS", strRank, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEETS", strFleet, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTE A", strAttributeA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTE B", strAttributeB, true, false);
	PARSE_RULE_PARAM(func, parameter, "LABEL A", strLabelA, true, false);
	PARSE_RULE_PARAM(func, parameter, "LABEL B", strLabelB, true, false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP A", strAssignmentA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP B", strAssignmentB, true, false);
	PARSE_RULE_PARAM(func, parameter, "QUALIFIER A", strQualifierA, true, false);
	PARSE_RULE_PARAM(func, parameter, "QUALIFIER B", strQualifierB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LOCATION EQUAL BASE A", strAEqualToBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LOCATION EQUAL BASE B", strBEqualToBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORT A", strAirportsA, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORT B", strAirportsB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS REQUESTED A", strIsReqA, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS REQUESTED B", strIsReqB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LINE TRAINING A", strIsLineTrainingA, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LINE TRAINING B", strIsLineTrainingB, true, false);
	PARSE_RULE_PARAM(func, parameter, "COURSE CODE A", strCourseCodeA, true, false);
	PARSE_RULE_PARAM(func, parameter, "COURSE CODE B", strCourseCodeB, true, false);
	PARSE_RULE_PARAM(func, parameter, "SPACE", strSpace, true, false);
	PARSE_RULE_PARAM(func, parameter, "UNIT", strUnit, true, false);
	PARSE_RULE_PARAM(func, parameter, "DIRECTIONAL", strDirectional, true, false);
	PARSE_RULE_PARAM(func, parameter, "UTILIZE POST DUTY REST", strUtilizePostRest, true, false);
	PARSE_RULE_PARAM(func, parameter, "ROLES A", strRolesA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ROLES B", strRolesB, true, false);
	PARSE_RULE_PARAM(func, parameter, "CREW TEAMS", strTeam, true, false);

	shared_ptr<rule8056> cache = shared_ptr<rule8056>(new rule8056);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strAttributeA = strAttributeA;
	cache->strAttributeB = strAttributeB;
	cache->strLabelA = strLabelA;
	cache->strLabelB = strLabelB;
	cache->strAssignmentA = strAssignmentA;
	cache->strAssignmentB = strAssignmentB;
	cache->strQualifierA = strQualifierA;
	cache->strQualifierB = strQualifierB;
	cache->strAEqualToBase = strAEqualToBase;
	cache->strBEqualToBase = strBEqualToBase;
	cache->strAirportsA = strAirportsA;
	cache->strAirportsB = strAirportsB;
	cache->strIsReqA = strIsReqA;
	cache->strIsReqB = strIsReqB;
	cache->strIsLineTrainingA = strToUpper(strIsLineTrainingA);
	cache->strIsLineTrainingB = strToUpper(strIsLineTrainingB);
	cache->strCourseCodeA = strToUpper(strCourseCodeA);
	if (!cache->strCourseCodeA.empty() && cache->strCourseCodeA != "*") {
		split(cache->strCourseCodeA, '|', cache->courseCodesA);
	}
	cache->strCourseCodeB = strToUpper(strCourseCodeB);
	if (!cache->strCourseCodeB.empty() && cache->strCourseCodeB != "*") {
		split(cache->strCourseCodeB, '|', cache->courseCodesB);
	}
	cache->strSpace = strSpace;
	cache->strUnit = strUnit;
	cache->strDirectional = strDirectional;
	cache->strUtilizePostRest = strUtilizePostRest;

	cache->strRolesA = strRolesA;
	cache->strRolesB = strRolesB;
	cache->strTeam = strTeam;

	return cache;
}

//预处理7270
shared_ptr<ruleParams> parseRuleParam7270(DBRule& item) {
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBase = "*";
	string strRank = "*";
	string strFleet = "*";
	string strAttributeA = "*";
	string strAttributeB = "*";
	string strLabelA = "*";
	string strLabelB = "*";
	string strAssignmentA = "*";
	string strAssignmentB = "*";
	string strQualifierA = "*";
	string strQualifierB = "*";
	string strAEqualToBase = "*";
	string strBEqualToBase = "*";
	string strAirportsA = "*";
	string strAirportsB = "*";
	string strIsReqA;
	string strIsReqB;
	string strIsLineTrainingA = "*";
	string strIsLineTrainingB = "*";
	string strSpace;
	string strUnit;
	string strDirectional;
	string strUtilizePostRest;
	string strRolesA = "*";
	string strRolesB = "*";
	string strTeam = "*";

	PARSE_RULE_PARAM(func, parameter, "BASES", strBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "RANKS", strRank, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEETS", strFleet, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTE A", strAttributeA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTE B", strAttributeB, true, false);
	PARSE_RULE_PARAM(func, parameter, "LABEL A", strLabelA, true, false);
	PARSE_RULE_PARAM(func, parameter, "LABEL B", strLabelB, true, false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP A", strAssignmentA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP B", strAssignmentB, true, false);
	PARSE_RULE_PARAM(func, parameter, "QUALIFIER A", strQualifierA, true, false);
	PARSE_RULE_PARAM(func, parameter, "QUALIFIER B", strQualifierB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LOCATION EQUAL BASE A", strAEqualToBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LOCATION EQUAL BASE B", strBEqualToBase, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORT A", strAirportsA, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORT B", strAirportsB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS REQUESTED A", strIsReqA, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS REQUESTED B", strIsReqB, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LINE TRAINING A", strIsLineTrainingA, true, false);
	PARSE_RULE_PARAM(func, parameter, "IS LINE TRAINING B", strIsLineTrainingB, true, false);
	PARSE_RULE_PARAM(func, parameter, "SPACE", strSpace, true, false);
	PARSE_RULE_PARAM(func, parameter, "UNIT", strUnit, true, false);
	PARSE_RULE_PARAM(func, parameter, "DIRECTIONAL", strDirectional, true, false);
	PARSE_RULE_PARAM(func, parameter, "UTILIZE POST DUTY REST", strUtilizePostRest, true, false);
	PARSE_RULE_PARAM(func, parameter, "ROLES A", strRolesA, true, false);
	PARSE_RULE_PARAM(func, parameter, "ROLES B", strRolesB, true, false);
	PARSE_RULE_PARAM(func, parameter, "CREW TEAMS", strTeam, true, false);

	shared_ptr<rule7270> cache = shared_ptr<rule7270>(new rule7270);
	cache->strBase = strBase;
	cache->strRank = strRank;
	cache->strFleet = strFleet;
	cache->strAttributeA = strAttributeA;
	cache->strAttributeB = strAttributeB;
	cache->strLabelA = strLabelA;
	cache->strLabelB = strLabelB;
	cache->strAssignmentA = strAssignmentA;
	cache->strAssignmentB = strAssignmentB;
	cache->strQualifierA = strQualifierA;
	cache->strQualifierB = strQualifierB;
	cache->strAEqualToBase = strAEqualToBase;
	cache->strBEqualToBase = strBEqualToBase;
	cache->strAirportsA = strAirportsA;
	cache->strAirportsB = strAirportsB;
	cache->strIsReqA = strIsReqA;
	cache->strIsReqB = strIsReqB;
	cache->strIsLineTrainingA = strToUpper(strIsLineTrainingA);
	cache->strIsLineTrainingB = strToUpper(strIsLineTrainingB);
	cache->strSpace = strSpace;
	cache->strUnit = strUnit;
	cache->strDirectional = strDirectional;
	cache->strUtilizePostRest = strUtilizePostRest;

	cache->strRolesA = strRolesA;
	cache->strRolesB = strRolesB;
	cache->strTeam = strTeam;

	return cache;
}

//8117
shared_ptr<ruleParams> parseRuleParam8117(DBRule& item) {

	int ret = 0;
	int func = item.function;
	map<string, string>& parameter = item.params;
	string strBases = "*";
	string strRanks = "*";
	string strFleets = "*";
	string strTeams = "*";
	string strFltFleets = "*";
	string strAttributes="*";
	string strCrewNationality;
	string strAirports="*";
	string strCombinations;
	string strAssignments = "FLY";
	string strActingRanks = "*";
	string strDep = "*", strArr = "*",strPilots="*";
	string strFlts = "*";

	PARSE_RULE_PARAM(func, parameter, "BASES", strBases, true, false);
	PARSE_RULE_PARAM(func, parameter, "RANKS", strRanks, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLEETS", strFleets, true, false);
	PARSE_RULE_PARAM(func, parameter, "CREW TEAMS", strTeams, true, false);
	PARSE_RULE_PARAM(func, parameter, "PILOTS", strPilots, true, false);
	PARSE_RULE_PARAM(func, parameter, "AIRPORTS", strAirports, true, false);
	PARSE_RULE_PARAM(func, parameter, "ATTRIBUTES", strAttributes, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHT ASSIGNMENT GROUPS", strAssignments, true, false);

	//格式：RTEW+RTEE+RTES+RTES|RTEW+RTES+RTES+RTES，
	//1. 不支持RTEW+RTEE+2RTES；
	//2. 不支持“|”两侧数量不等，如：RTEW+RTEE+RTES|RTEW+RTES+RTES+RTES
	//3. 不支持员工有两个生效的报务资格
	PARSE_RULE_PARAM(func, parameter, "REQUIRED QUALIFICATIONS", strCombinations, true, false);
	PARSE_RULE_PARAM(func, parameter, "ACTING RANKS", strActingRanks, true, false);

	PARSE_RULE_PARAM(func, parameter, "FLIGHT FLEETS", strFltFleets, true, false);
	PARSE_RULE_PARAM(func, parameter, "CREW NATIONALITIES", strCrewNationality, true, false);
	PARSE_RULE_PARAM(func, parameter, "DEP", strDep, true, false);
	PARSE_RULE_PARAM(func, parameter, "ARR", strArr, true, false);
	PARSE_RULE_PARAM(func, parameter, "FLIGHTS", strFlts, true, false);
	
	if (strFlts.size() == 0)
		strFlts = "*";

	shared_ptr<rule8117> cache = shared_ptr<rule8117>(new rule8117);
	cache->strBases = strBases;
	cache->strRanks = strRanks;
	cache->strFleets = strFleets;
	cache->strTeams = strTeams;
	cache->strPilots = strPilots;
	cache->strAirports = strAirports;
	cache->strAttributes = strAttributes;
	cache->strAssignments = strAssignments;
	cache->strCombinations = strCombinations;
	cache->strActingRanks = strActingRanks;
	cache->strFlights = strFlts;

	cache->strDeps = strDep;
	cache->strArrs = strArr;
	cache->strFltFleets = strFltFleets;
	cache->strNationality = strCrewNationality;
	return cache;
}

shared_ptr<ruleParams> parseRuleParam8107(DBRule& item) {

		int ret = 0;
		int func = item.function;
		map<string, string>& parameter = item.params;
		string assignmentA = "*";
		string assignmentB = "*";
		string qualifierA = "*";
		string qualifierB = "*";
		string groupGapRange = "*";
		string isMergeFdp = "Y";
		string mergeFdpLogic = "*";
		string isMergeDp = "Y";
		string mergeDpLogic = "*";

		PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP A", assignmentA, true, false);
		PARSE_RULE_PARAM(func, parameter, "ASSIGNMENT GROUP B", assignmentB, true, false);
		PARSE_RULE_PARAM(func, parameter, "QUALIFIER A", qualifierA, true, false);
		PARSE_RULE_PARAM(func, parameter, "QUALIFIER B", qualifierB, true, false);
		PARSE_RULE_PARAM(func, parameter, "GROUP GAP RANGE", groupGapRange, true, false);
		PARSE_RULE_PARAM(func, parameter, "IS MERGE FDP", isMergeFdp, true, false);
		PARSE_RULE_PARAM(func, parameter, "MERGE FDP LOGIC", mergeFdpLogic, true, false);
		PARSE_RULE_PARAM(func, parameter, "IS MERGE DP", isMergeDp, true, false);
		PARSE_RULE_PARAM(func, parameter, "MERGE DP LOGIC", mergeDpLogic, true, false);

		shared_ptr<rule8107> cache = shared_ptr<rule8107>(new rule8107);
		cache->assignmentA = assignmentA;
		cache->assignmentB = assignmentB;
		cache->qualifierA = qualifierA;
		cache->qualifierB = qualifierB;
		cache->groupGapRange = groupGapRange;
		if (groupGapRange != "*") {
			vector<string> splitstrs;
			split(groupGapRange.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				splitstrs[0] = trim(splitstrs[0]);
				splitstrs[1] = trim(splitstrs[1]);
				if (splitstrs[0] != "*") {
					cache->groupGapRangeLowerMinutes = hhmmToMinutes(splitstrs[0].c_str());
				}
				if (splitstrs[1] != "*") {
					cache->groupGapRangeUpperMinutes = hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		cache->isMergeFdp = (isMergeFdp == "Y" || isMergeFdp == "y");
		cache->mergeFdpLogic = strToUpper(mergeFdpLogic);
		cache->isMergeDp = (isMergeDp == "Y" || isMergeDp == "y");
		cache->mergeDpLogic = strToUpper(mergeDpLogic);
		return cache;
}
