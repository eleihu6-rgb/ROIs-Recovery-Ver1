/**
 * @file CheckMinNumCrewRankRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <algorithm>
#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMinNumCrewRankRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "Log/Logger.h"

using namespace std;

void CheckMinNumCrewRankRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
				case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _segmentAssignments);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::CREW_RANKS): {
					_strCrewRanks = substr;
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _crewRanks);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::MIN_NUMBER):
					_minNumber = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::SEVERITY):
					this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
					break;
                default:
					Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckMinNumCrewRankRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	//Segment Assignments,Crew Ranks,Min Num
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "CREW RANKS") {
			_strCrewRanks = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewRanks);
			}
		}
		else if (header == "MIN NUM") {
			_minNumber = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

bool CheckMinNumCrewRankRuleParam::MatchSegmentAssignments(const Segment & segment, const std::shared_ptr<CREW>& crew) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	//string assignment = segment.getAssignment();
	//auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	//if (iter == _segmentAssignments.cend()) {
	//	return false;
	//}

	//当前Crew在航班的assigment来判断
	auto& dbData = this->GetRule()->GetDataContext();
	auto rf = dbData->rosterFlightMgr.get(segment.getDBId(), crew->idCrew);
	if (rf == nullptr) {
		Logger::getRuleLogger()->debug("ERROR: miss roster flight record. crewId:{}, pairingId:{}, fltId:{}", crew->idCrew, segment.getPairingId(), segment.getDBId());
		return false;
	}
	auto iter  = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), rf->assignment);
	return iter != _segmentAssignments.cend();
	
}

bool CheckMinNumCrewRankRuleParam::MatchSegmentCrewNumber(const vector<shared_ptr<RosterFlight>>& rfs) const {
	const int FLT_CREW_MIN_NUM = 2;//航班已分配机组数量
	int fltCrewNum = 0;
	for (auto& rf : rfs) {
		if (std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), rf->assignment) != _segmentAssignments.cend()) {
			fltCrewNum++;
		}
	}
	return fltCrewNum >= FLT_CREW_MIN_NUM;
}

bool CheckMinNumCrewRankRuleParam::MatchParam(const Segment & segment, const std::shared_ptr<CREW>& crew) const {

	if (!MatchSegmentAssignments(segment, crew)) {
		return false;
	}

	return true;
}


