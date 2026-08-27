/**
 * @file ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::FIRST_ODP_MINIMUM):
				_firstODPMin = substr;
				_firstODPMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FIRST_FDP_MAXIMUM):
				_firstFDPMax = substr;
				_firstFDPMaxMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_ODP_MINIMUM):
				_secondODPMin = substr;
				_secondODPMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_ODP_ACC_STATE):
				_secondODPAcclimatizedState = substr;
				break;
			case enum_to_underlying(ParamLocation::SECOND_FDP_MAXIMUM):
				_secondFDPMax = substr;
				_secondFDPMaxMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::THIRD_ODP_MINIMUM):
				_thirdODPMin = substr;
				_thirdODPMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_ODP_REDUCED_TO_MINIMUM):
				_secondODPReducedToMin = substr;
				_secondODPReducedToMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
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

void ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//First ODP Minimum,First FDP Maximum,Second ODP Minimum,Second ODP ACC State,Second FDP Maximum,Third ODP Minimum,Second ODP Reduced to Minimum
		if (header == "FIRST ODP MINIMUM") {
			_firstODPMin = headeValue;
			_firstODPMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FIRST FDP MAXIMUM") {
			_firstFDPMax = headeValue;
			_firstFDPMaxMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND ODP MINIMUM") {
			_secondODPMin = headeValue;
			_secondODPMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND ODP ACC STATE") {
			_secondODPAcclimatizedState = headeValue;
		}
		else if (header == "SECOND FDP MAXIMUM") {
			_secondFDPMax = headeValue;
			_secondFDPMaxMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "THIRD ODP MINIMUM") {
			_thirdODPMin = headeValue;
			_thirdODPMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND ODP REDUCED TO MINIMUM") {
			_secondODPReducedToMin = headeValue;
			_secondODPReducedToMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在外站（非基地）条件
bool ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::MatchAwayFromHomeBase(const Duty& duty, const std::string& base) const {
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		return base != duty.getArrStationRead();
	}
	// if editor mode, base is extracted from the segment's pairing
	Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
	if (pairing == nullptr) {
		spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
		return true;
	}
	return duty.getArrStationRead() != pairing->getBase();
}

bool ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::MatchDutyAssignments(const Duty& duty) const {
	if (AssignmentUtils::IsFlyAssignment(duty.getAssignment(), this->GetRule()->GetDataContext())) {
		return true;
	}
	return false;
}

//匹配Duty和ODP范围
bool ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::MatchDutyAndODP(const Duty& firstODPBeforeDuty, const Duty& firstFDPDuty, const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins) const {
	//判断1
	int odp1Minutes = static_cast<int>(firstFDPDuty.getStartTimeUtcAct() - firstODPBeforeDuty.getEndTimeUtcAct()) / 60;
	if (_firstODPMin != RuleParamConstant::IGNORED && odp1Minutes < this->_firstODPMinMinutes) {
		return false;
	}
	
	//判断2
	int fdpMinutes = firstFDPDuty.getFDPInSecs() / 60;
	long callinSBY_FDPMins = GetCallinSBY_FDPMins(firstFDPDuty, mapCallinSBY_FDPMins);
	if (callinSBY_FDPMins > 0) {
		fdpMinutes += callinSBY_FDPMins;
	}
	if (_firstFDPMax != RuleParamConstant::IGNORED && this->_firstFDPMaxMinutes < fdpMinutes) {
		return false;
	}

	//判断3
	int odp2Minutes = static_cast<int>(secondFDPDuty.getStartTimeUtcAct() - firstFDPDuty.getEndTimeUtcAct()) / 60;
	if (_secondODPMin != RuleParamConstant::IGNORED && odp2Minutes < this->_secondODPMinMinutes) {
		return false;
	}
	if (_secondODPAcclimatizedState != RuleParamConstant::ALL && secondFDPDuty.getAcclimatisedState() != this->_secondODPAcclimatizedState) {
		return false;
	}
	//OPD2需要包括本地夜晚
	int offsetMinutes = this->GetRule()->GetDataContext()->getAirportOffsetMinutes(firstFDPDuty.getArrivalStation());
	int localNight = DutyUtils::GetLocalNightNums(firstFDPDuty.getEndTimeUtcAct(), secondFDPDuty.getStartTimeUtcAct(), offsetMinutes);
	if (localNight < 1) {
		return false;
	}

	//判断4
	int fdpMinutes2 = secondFDPDuty.getFDPInSecs() / 60;
	callinSBY_FDPMins = GetCallinSBY_FDPMins(secondFDPDuty, mapCallinSBY_FDPMins);
	if (callinSBY_FDPMins > 0) {
		fdpMinutes2 += callinSBY_FDPMins;
	}
	if (_secondFDPMax != RuleParamConstant::IGNORED && this->_secondFDPMaxMinutes < fdpMinutes2) {
		return false;
	}

	//判断5
	int odp3Minutes = static_cast<int>(thirdFDPDuty.getStartTimeUtcAct() - secondFDPDuty.getEndTimeUtcAct()) / 60;
	if (_thirdODPMin != RuleParamConstant::IGNORED && odp3Minutes < this->_thirdODPMinMinutes) {
		return false;
	}
	//OPD3需要包括本地夜晚
	offsetMinutes = this->GetRule()->GetDataContext()->getAirportOffsetMinutes(secondFDPDuty.getArrivalStation());
	localNight = DutyUtils::GetLocalNightNums(secondFDPDuty.getEndTimeUtcAct(), thirdFDPDuty.getStartTimeUtcAct(), offsetMinutes);
	if (localNight < 1) {
		return false;
	}

	return true;
}

//匹配规则参数是否满足
bool ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::MatchParam(const Duty& firstODPBeforeDuty, const Duty& firstFDPDuty, 
	const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const std::string& base, const map<long long, long>& mapCallinSBY_FDPMins) const {

	if (!MatchAwayFromHomeBase(firstFDPDuty, base)) {
		return false;
	}

	if (!MatchDutyAssignments(firstFDPDuty)) {
		return false;
	}

	if (!MatchDutyAndODP(firstODPBeforeDuty, firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins)) {
		return false;
	}

	return true;
}

bool ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::ValidReducedToMinRest() const {
	if (_secondODPReducedToMin.empty() || _secondODPReducedToMin == RuleParamConstant::IGNORED) {
		return false;
	}
	return true;
}

long ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam::GetCallinSBY_FDPMins(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const {
	long callinSBY_FDPMins = 0;
	if (duty.getDutySeq() == 1 && duty.getPairingId() > 0) {
		//Standby抓飞(called out)进行FDP合并仅针对第一段Duty(SBY与FLY重叠)
		auto iter = mapCallinSBY_FDPMins.find(duty.getPairingId());
		if (iter != mapCallinSBY_FDPMins.end()) {
			callinSBY_FDPMins = iter->second;
		}
	}
	return callinSBY_FDPMins;
}