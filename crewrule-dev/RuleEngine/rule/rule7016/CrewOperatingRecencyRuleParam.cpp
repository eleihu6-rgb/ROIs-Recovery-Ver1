/**
 * @file CrewOperatingRecencyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CrewOperatingRecencyRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CrewOperatingRecencyRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			case enum_to_underlying(ParamLocation::TEAMS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;

			case enum_to_underlying(ParamLocation::ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			case enum_to_underlying(ParamLocation::MAX_DAYS_SINCE_LAST_OPERATING):
				_maxDaysSinceLastOperating = StringUtils::stoi(substr, 0);
				break;
			case enum_to_underlying(ParamLocation::OPERATING_FLEETS): {
				_strOperFleets = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _operFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::OPERATING_AIRPORTS): {
				_strOperAirports = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _operAirports);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CrewOperatingRecencyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Assignments,Max Days Since Last Operating
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "MAX DAYS SINCE LAST OPERATING") {
			_maxDaysSinceLastOperating = StringUtils::stoi(headeValue, 0);
		}
		else if (header == "OPERATING FLEETS") {
			_strOperFleets = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _operFleets);
			}
		}
		else if (header == "OPERATING AIRPORTS") {
			_strOperAirports = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _operAirports);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CrewOperatingRecencyRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

//匹配规则参数是否满足
bool CrewOperatingRecencyRuleParam::MatchParam(const ROSTER* roster) const {
	if (!MatchAssignments(roster)) {
		return false;
	}

	if (!MatchOperatingFleetAndAirport(roster)) {
		return false;
	}
	return true;
}

bool CrewOperatingRecencyRuleParam::MatchAssignments(const ROSTER* roster) const {
	if (_assignments.empty()) {
		return true;
	}
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), roster->qualifier);
	return iter != _assignments.cend();
}

bool CrewOperatingRecencyRuleParam::MatchOperatingFleetAndAirport(const ROSTER* roster) const {
	if (roster->pairing == nullptr) {
		return true;
	}

	for (auto& duty : roster->pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			//任何一个航班匹配到即可
			if (segment->getIsOperating() && MatchOperatingFleet(segment) && MatchOperatingAirport(segment)) {
				return true;
			}
		}
	}
	return false;
}

//匹配运行机型
bool CrewOperatingRecencyRuleParam::MatchOperatingFleet(const Segment* segment) const {
	if (_operFleets.empty()) {
		return true;
	}
	return _operFleets.find(segment->getFleetCD()) != _operFleets.end();
}

//匹配运行机场
bool CrewOperatingRecencyRuleParam::MatchOperatingAirport(const Segment* segment) const {
	if (_operAirports.empty()) {
		return true;
	}
	return _operAirports.find(segment->getDepStationRead()) != _operAirports.end() 
		|| _operAirports.find(segment->getArrStationRead()) != _operAirports.end();
}

int CrewOperatingRecencyRuleParam::CheckRuleForFd(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	std::set<WarnCode> warnCodes{ WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN , WarnCode::NO_OPERATING_FLEETS_WARN , WarnCode::NO_OPERATING_AIRPORTS_WARN };
	time_t rosterLocalDay = TimeUtils::GetStartTimeOfDay(roster->getStartTimeLocAct());
	auto& crewMandayFd = crew->mandayFdList;

	if (this->_operFleets.empty()) {
		warnCodes.erase(WarnCode::NO_OPERATING_FLEETS_WARN);
	}
	if (this->_operAirports.empty()) {
		warnCodes.erase(WarnCode::NO_OPERATING_AIRPORTS_WARN);
	}

	for (auto iter = crewMandayFd.rbegin(); iter != crewMandayFd.rend(); ++iter)
	{
		int days = TimeUtils::DiffDay((*iter)->dateLoc, rosterLocalDay);
		if (days <= 0) {
			//manday日期 大于 当前roster日期，则忽略掉
			continue;
		}
		if (days > this->_maxDaysSinceLastOperating) {
			break;
		}

		if ((*iter)->blh > 0) {
			//日期在maxDaysSinceLastOperating之内，存在飞行任务（BLH>0) 则不告警 WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN
			warnCodes.erase(WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN);
		}
		
		for (auto& pair : (*iter)->operating_fleets) {
			if (this->_operFleets.find(pair.first) != this->_operFleets.end()) {
				warnCodes.erase(WarnCode::NO_OPERATING_FLEETS_WARN);

			}
		}

		for (auto& pair : (*iter)->operating_airports) {
			if (this->_operAirports.find(pair.first) != this->_operAirports.end()) {
				warnCodes.erase(WarnCode::NO_OPERATING_AIRPORTS_WARN);
			}
		}
	}
	return GetWarnCode(warnCodes);
}

int CrewOperatingRecencyRuleParam::CheckRuleForCC(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	std::set<WarnCode> warnCodes{ WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN , WarnCode::NO_OPERATING_FLEETS_WARN , WarnCode::NO_OPERATING_AIRPORTS_WARN };
	time_t rosterLocalDay = TimeUtils::GetStartTimeOfDay(roster->getStartTimeLocAct());
	auto& crewMandayCcAm = crew->mandayCcAmList;

	if (this->_operFleets.empty()) {
		warnCodes.erase(WarnCode::NO_OPERATING_FLEETS_WARN);
	}
	if (this->_operAirports.empty()) {
		warnCodes.erase(WarnCode::NO_OPERATING_AIRPORTS_WARN);
	}
	for (auto iter = crewMandayCcAm.rbegin(); iter != crewMandayCcAm.rend(); ++iter)
	{
		int days = TimeUtils::DiffDay((*iter)->dateLoc, rosterLocalDay);
		if (days <= 0) {
			//manday日期 大于 当前roster日期，则忽略掉
			continue;
		}
		if (days > this->_maxDaysSinceLastOperating) {
			break;
		}

		if ((*iter)->blh > 0) {
			//日期在maxDaysSinceLastOperating之内，存在飞行任务（BLH>0) 则不告警 WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN
			warnCodes.erase(WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN);
		}

		for (auto& pair : (*iter)->operating_fleets) {
			if (this->_operFleets.find(pair.first) != this->_operFleets.end()) {
				warnCodes.erase(WarnCode::NO_OPERATING_FLEETS_WARN);
			}
		}

		for (auto& pair : (*iter)->operating_airports) {
			if (this->_operAirports.find(pair.first) != this->_operAirports.end()) {
				warnCodes.erase(WarnCode::NO_OPERATING_AIRPORTS_WARN);
			}
		}
	}
	return GetWarnCode(warnCodes);
}

int CrewOperatingRecencyRuleParam::CheckRule(const ROSTER* roster) const {
	int warnCode = (int)WarnCode::NO_WARN;
	std::shared_ptr<CREW> crew = this->GetRule()->GetDataContext()->crewIdMap[roster->idcrew];
	if (crew->division == "P") {
		//飞行
		warnCode = CheckRuleForFd(roster, crew);
	}
	else {
		//客舱
		warnCode = CheckRuleForCC(roster, crew);
	}
	return warnCode;
}

int CrewOperatingRecencyRuleParam::GetWarnCode(const std::set<WarnCode>& warnCodes) const {
	int warnCode = (int)WarnCode::NO_WARN;
	for (auto tmpWarnCode : warnCodes) {
		if (warnCodes.size() > 1 && tmpWarnCode == WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN) {
			//有机型和机场告警，则MAX_DAYS_SINCE_LAST_OPERATING_WARN不需要告警，避免重复告警。
			continue;
		}
		warnCode |= (int)tmpWarnCode;
	}
	return warnCode;
}