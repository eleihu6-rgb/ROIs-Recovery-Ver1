/**
 * @file ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam.cpp
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
#include "ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::FIRST_FDP_MAXIMUM):
				_firstFDPMax = substr;
				_firstFDPMaxMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FIRST_ODP_MINIMUM):
				_firstODPMin = substr;
				_firstODPMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_FDP_MAXIMUM):
				_secondFDPMax = substr;
				_secondFDPMaxMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_FDP_ACC_STATE):
				_secondFDPAcclimatizedState = substr;
				break;
			case enum_to_underlying(ParamLocation::SECOND_ODP_MINIMUM):
				_secondODPMin = substr;
				_secondODPMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SECOND_ODP_LOCAL_NIGHTS):
				_secondODPLocalNightNum = atoi(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::FIRST_ODP_REDUCED_TO_MINIMUM):
				_firstODPReducedToMin = substr;
				_firstODPReducedToMinMinutes = (substr == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(substr);
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

void ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//First FDP Maximum,First ODP Minimum,Second FDP Maximum,Second FDP ACC State,Second ODP Minimum,Second ODP Local Nights,First ODP Reduced to Minimum
		if (header == "FIRST FDP MAXIMUM") {
			_firstFDPMax = headeValue;
			_firstFDPMaxMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FIRST ODP MINIMUM") {
			_firstODPMin = headeValue;
			_firstODPMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND FDP MAXIMUM") {
			_secondFDPMax = headeValue;
			_secondFDPMaxMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND FDP ACC STATE") {
			_secondFDPAcclimatizedState = headeValue;
		}
		else if (header == "SECOND ODP MINIMUM") {
			_secondODPMin = headeValue;
			_secondODPMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SECOND ODP LOCAL NIGHTS") {
			_secondODPLocalNightNum = atoi(headeValue.c_str());
		}
		else if (header == "FIRST ODP REDUCED TO MINIMUM") {
			_firstODPReducedToMin = headeValue;
			_firstODPReducedToMinMinutes = (headeValue == RuleParamConstant::IGNORED) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在外站（非基地）条件
bool ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::MatchAwayFromHomeBase(const Duty& duty, const std::string& base) const {
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

bool ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::MatchDutyAssignments(const Duty& duty) const {
	if (AssignmentUtils::IsFlyAssignment(duty.getAssignment(), this->GetRule()->GetDataContext())) {
		return true;
	}
	return false;
}

//匹配Duty和ODP范围
bool ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::MatchDutyAndODP(const Duty& firstFDPDuty, const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins) const {
	//判断1
	int odp1Minutes = static_cast<int>(secondFDPDuty.getStartTimeUtcAct() - firstFDPDuty.getEndTimeUtcAct()) / 60;
	if (_firstODPMin != RuleParamConstant::IGNORED && odp1Minutes < this->_firstODPMinMinutes) {
		return false;
	}
	if (firstFDPDuty.getManualFdpDiscretion() > 0) {
		return false;
	}

	//判断2
	if (_secondFDPAcclimatizedState != RuleParamConstant::ALL && secondFDPDuty.getAcclimatisedState() != this->_secondFDPAcclimatizedState) {
		return false;
	}
	int fdpMinutes = secondFDPDuty.getFDPInSecs() / 60;
	long callinSBY_FDPMins = GetCallinSBY_FDPMins(secondFDPDuty, mapCallinSBY_FDPMins);
	if (callinSBY_FDPMins > 0) {
		fdpMinutes += callinSBY_FDPMins;
	}
	if (_secondFDPMax != RuleParamConstant::IGNORED && this->_secondFDPMaxMinutes < fdpMinutes) {
		return false;
	}

	//判断3
	int odp2Minutes = static_cast<int>(thirdFDPDuty.getStartTimeUtcAct() - secondFDPDuty.getEndTimeUtcAct()) / 60;
	if (_secondODPMin != RuleParamConstant::IGNORED && odp2Minutes < this->_secondODPMinMinutes) {
		return false;
	}
	//OPD2需要包括至少2个本地夜晚
	int offsetMinutes = this->GetRule()->GetDataContext()->getAirportOffsetMinutes(secondFDPDuty.getArrivalStation());
	int localNight = DutyUtils::GetLocalNightNums(secondFDPDuty.getEndTimeUtcAct(), thirdFDPDuty.getStartTimeUtcAct(), offsetMinutes);
	if (localNight < 2) {
		return false;
	}
	return true;
}


//匹配规则参数是否满足
bool ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::MatchParam(const Duty& firstFDPDuty, const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const std::string& base, const map<long long, long>& mapCallinSBY_FDPMins) const {

	if (!MatchAwayFromHomeBase(firstFDPDuty, base)) {
		return false;
	}

	if (!MatchDutyAssignments(firstFDPDuty)) {
		return false;
	}

	if (!MatchDutyAndODP(firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins)) {
		return false;
	}

	return true;
}

bool ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::ValidReducedToMinRest() const {
	if (_firstODPReducedToMin.empty() || _firstODPReducedToMin == RuleParamConstant::IGNORED) {
		return false;
	}
	return true;
}

long ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam::GetCallinSBY_FDPMins(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const {
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