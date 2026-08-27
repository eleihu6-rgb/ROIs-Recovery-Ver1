/**
 * @file CalculateReducedRestForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateReducedRestForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateReducedRestForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Compositions,Duty Assignments,Duty Fleet,Duty Type,BLH Ranges,Based Min Rest,Increment of FDP
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest
		if (header == "IS HOME BASE") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "REST MIN") {
			if (headeValue != RuleParamConstant::ALL) {
				_restMin = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "MAX TIMES BETWEEN DO") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxTimesBetweenDO = atoi(headeValue.c_str());
			}
		}
		else if (header == "IS REDUCE NEXT DUTY MAX FDP") {
			_isReduceNextDutyMaxFDP = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "IS ADD NEXT DUTY MIN REST") {
			_isAddNextDutyMinRest = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否在基地
bool CalculateReducedRestForTGRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	//MinRest是否在基地，采用Duty的到达机场
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

//判断是否是DO
bool CalculateReducedRestForTGRuleParam::MatchDOAssignment(const std::string& assignment) const {
	
	if (!_doAssignments.empty() && _doAssignments[0] != "*") {
		if (find(_doAssignments.begin(), _doAssignments.end(), assignment) == _doAssignments.end()) {
			return false;
		}
	}
	
	if (!_doAssignmentGroups.empty() && _doAssignmentGroups[0] != "*") {
		const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();
		bool matchGroup = false;
		for (auto assigmentGroup : _doAssignmentGroups) {
			if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
				matchGroup = true;
				break;
			}
		}
		if (!matchGroup) {
			return false;
		}
	}
	
	return true;
}




