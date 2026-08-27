#include "CheckMaxFlightDutyTimeRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/DutyUtils.h"
#include "utils/TimeUtils.h"


bool CheckMaxFlightDutyTimeRule::CheckRule(const Duty* duty) const {

	if (this->_ruleParams.empty()) {
		return true;
	}
	
	return this->CheckMaxFlightTime(duty);
	

}

bool CheckMaxFlightDutyTimeRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {

	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	for (const auto & roster : rosters) {
		for (auto duty : roster->pairing->getDutyVec()) {
			return this->CheckMaxFlightTime(duty, roster);
		}
	}
	return true;
}


bool CheckMaxFlightDutyTimeRule::CheckMaxFlightTime(const Duty* duty, const ROSTER* roster) const {
	
	int fdpDiscretionMinutes = 0;
	int ftDiscretionMinutes = 0;
	if (duty->supportDiscretionType(DiscretionType::FDP)) {
		fdpDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::FDP);
	}
	if (duty->supportDiscretionType(DiscretionType::FT)) {
		ftDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::FT);
	}

	for (const auto & _ruleParam : _ruleParams) {

		string bunk = _ruleParam._restFacility;
		int RestFacility = 0;
		if (bunk != "" &&bunk != "*") {
			RestFacility = stoi(bunk);
		}
		//iMaxFDP是分钟
		int iMaxFDP = _ruleParam._maxFdp + fdpDiscretionMinutes;
		int iMaxFt = _ruleParam._maxFt + ftDiscretionMinutes;
		int iMaxExtension = 0;//iMaxExtension单位为s
		int iLandingLow = _ruleParam._landingLower;
		int iLandingUpper = _ruleParam._landingUpper;
		//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
		//duty->calculateFDP(0, FDP.str, FDP.end);
		//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
		//calculatePairingDutyTimes(duty, this->_dbData.get());

		time_t checkin = duty->getStartTimeUtcAct();//getStartTime();
		//checkin = Utility::GetInstance().getLocalTime(checkin,duty->getDepStation());
		long fdp = duty->getFDPInSecs();

		long dp = duty->getDPInSecs();
		long ft = const_cast<Duty*>(duty)->getBLKInMins() * 60;
		//yuankai.cai mantis#6861 mergeFdp检查
		if (roster != nullptr) {
			if (roster->pairing->getFirstDuty()->getDutyId() == duty->getDutyId()) {
				if (const_cast<ROSTER*>(roster)->dutyValues.getMergeFdp(0) != 0) {
					fdp = const_cast<ROSTER*>(roster)->dutyValues.getMergeFdp(0) * 60;
				}
			}
			else if (const_cast<ROSTER*>(roster)->pairing->getLastDuty()->getDutyId() == duty->getDutyId()) {
				if (const_cast<ROSTER*>(roster)->dutyValues.getMergeFdp((int)roster->pairing->getNumDuties() - 1) != 0) {
					fdp = const_cast<ROSTER*>(roster)->dutyValues.getMergeFdp((int)roster->pairing->getNumDuties() - 1) * 60;
				}
			}
		}
		int i = DutyUtils::GetRestfacility(duty, this->_dbData);
		//int i = 9999;
		//for (auto& segment : duty->getSegments())
		//{
		//	string tailNumber = segment->getTailNum();
		//	int ii = 0;
		//	if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()) {
		//		DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
		//		if (aircraft->isExistRest) {
		//			ii = aircraft->restFacility;
		//		}
		//	}
		//	else if (this->_dbData->fleetMap.find(segment->getFleetCD()) != this->_dbData->fleetMap.end()) {
		//		FLEET fleet = this->_dbData->fleetMap[segment->getFleetCD()];
		//		if (fleet.restfacility > ii) {
		//			ii = fleet.restfacility;
		//		}
		//	}
		//	if (ii < i)i = ii;
		//}

		if (i != RestFacility && bunk != "*")continue;
		int landing = DutyUtils::getLangdingNums(duty, this->_dbData.get());
		//map<string, int> mapComplement = duty->getComplementMap();
		//string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);
		//若seg延误则fdp可以延长
		if (fdp > iMaxFDP * 60) {
			for (int i = (int)(duty->getSegments().size()) - 1; i < (int)duty->getSegments().size() && i > 0; i++) {
				Segment* seg = duty->getSegment(i);
				if (seg->getEndTimeUtcAct() > seg->getEndTimeUtcSch()) {
					iMaxExtension = _ruleParam._maxExtension;
					break;
				}
			}
		}
		string strComplement = duty->getCompositionName();
		if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
		{
			strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
			//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		}
		string strBase = duty->getDepStation();
		bool bIsBunk = true;
		auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);

		int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
		int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());
		checkin += offsetMinutes * 60;

		bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
		if (isInRange && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
			) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
			_ruleViolation.SetParam("composition", strComplement);
			_ruleViolation.SetParam("duty_start", std::to_string(const_cast<Duty*>(duty)->getStartTimeUtcAct()));
			_ruleViolation.SetParam("duty_end", std::to_string(const_cast<Duty*>(duty)->getEndTimeUtcAct()));
			_ruleViolation.SetParam("duty_start", std::to_string(const_cast<Duty*>(duty)->getStartTimeUtcAct()));
			_ruleViolation.SetParam("duty_end", std::to_string(const_cast<Duty*>(duty)->getEndTimeUtcAct()));
			_ruleViolation.SetParam("pairing_id", std::to_string(const_cast<Duty*>(duty)->getPairingId()));
			_ruleViolation.SetParam("duty_seq", std::to_string(const_cast<Duty*>(duty)->getDutySeq()));
			_ruleViolation.SetParam("landings", std::to_string(landing));
			if (roster) {
				_ruleViolation.SetParam("crew_id", roster->idcrew);
				_ruleViolation.SetParam("roster_id", std::to_string(roster->rosterId));
			}
			if (_ruleParam._maxFdp > 0) {
				_ruleViolation.SetParam("current_fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60));
				_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(_ruleParam._maxFdp));
				_ruleViolation.SetParam("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretionMinutes));
				if (fdp > iMaxFDP * 60 + iMaxExtension && iMaxExtension != 0) {
					this->ThrowRuleViolation();
					return false;
				}
				else if (fdp > iMaxFDP * 60 && fdp <= iMaxFDP * 60 + iMaxExtension && iMaxExtension != 0) {
					this->ThrowRuleViolation();
					return false;
				}
				else if (fdp > iMaxFDP * 60) {
					this->ThrowRuleViolation();
					return false;
				}
			}
			if (_ruleParam._maxDp > 0 && dp > _ruleParam._maxDp * 60) {
				_ruleViolation.SetParam("current_dp", Utility::GetInstancePtr()->formatMinutes(dp / 60));
				_ruleViolation.SetParam("max_dp", Utility::GetInstancePtr()->formatMinutes(_ruleParam._maxDp));
				this->ThrowRuleViolation();
				return false;
			}
			if (_ruleParam._maxFt > 0 && ft > iMaxFt * 60) {
				_ruleViolation.SetParam("current_ft", Utility::GetInstancePtr()->formatMinutes(ft / 60));
				_ruleViolation.SetParam("max_ft", Utility::GetInstancePtr()->formatMinutes(_ruleParam._maxFt));
				_ruleViolation.SetParam("ft_discretion", Utility::GetInstancePtr()->formatMinutes(ftDiscretionMinutes));
				this->ThrowRuleViolation();
				return false;
			}
			return false;
		}
	}
	return true;
}

void CheckMaxFlightDutyTimeRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyTimeRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}


void CheckMaxFlightDutyTimeRule::ThrowRuleViolation() const {
	string errorMsg = "";

	if (!_ruleViolation.GetParam("max_fdp").empty()) {
		//"Flight duty period ({0:current_fdp}) is more than the limitation ({1:max_fdp})";
		errorMsg += "Flight duty period (" + _ruleViolation.GetParam("current_fdp") + ") is more than the limitation (" + _ruleViolation.GetParam("max_fdp")
			+ ")";
	}
	if (!_ruleViolation.GetParam("max_dp").empty()) {
		//"Duty period ({0:current_dp}) is more than the limitation ({1:max_dp})";
		errorMsg += "Duty period (" + _ruleViolation.GetParam("current_dp") + ") is more than the limitation (" + _ruleViolation.GetParam("max_dp")
			+ ")";
	}
	if (!_ruleViolation.GetParam("max_ft").empty()) {
		//"Flight time ({0:current_ft}) is more than the limitation ({1:max_ft})";
		errorMsg += "Flight time (" + _ruleViolation.GetParam("current_ft") + ") is more than the limitation (" + _ruleViolation.GetParam("max_ft")
			+ ")";
	}
	if (this->_dbData->isLiveMode() && !_ruleViolation.GetParam("fdp_discretion").empty()) {
		//"FDP discretion used ({0:fdp_discretion})"
		errorMsg += "FDP discretion used (" + _ruleViolation.GetParam("fdp_discretion") + ")";
	}
	if (this->_dbData->isLiveMode() && !_ruleViolation.GetParam("ft_discretion").empty()) {
		errorMsg += "Flight time discretion used (" + _ruleViolation.GetParam("ft_discretion") + ")";
	}
	errorMsg += " Crew complement=" + _ruleViolation.GetParam("composition") + ", Number of landings=" + _ruleViolation.GetParam("landings");
	string checkin_lower = _ruleViolation.GetParam("checkin_lower");
	string checkin_upper = _ruleViolation.GetParam("checkin_upper");
	string odp_lower = _ruleViolation.GetParam("odp_start");
	string odp_upper = _ruleViolation.GetParam("odp_end");
	if (!checkin_lower.empty() && !checkin_upper.empty()) {
		errorMsg += ", Check-in time (" + checkin_lower + "-" + checkin_upper + ").";
	}
	string before_odp = _ruleViolation.GetParam("before_duty_odp");
	if (!before_odp.empty()) {
		errorMsg += ", Operational duty period before duty (" + before_odp + ").";
	}
	string crewid = _ruleViolation.GetParam("crew_id");
	string rosterId = _ruleViolation.GetParam("roster_id");
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->pairingId = stoi(_ruleViolation.GetParam("pairing_id"));
	rv->dutySequenceNumber = stoi(_ruleViolation.GetParam("duty_seq"));
	rv->idRule = CheckMaxFlightDutyTimeRule::GetRuleFuncId();
	rv->startDTUtc = stol(_ruleViolation.GetParam("duty_start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("duty_end"));
	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	if (!crewid.empty()) {
		rv->crewId = crewid;
		rv->rosterId = stoll(rosterId);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("ruleId", "6107.2"));
	rv->operation_result.insert(pair<string, string>("fdp", _ruleViolation.GetParam("current_fdp")));
	rv->operation_result.insert(pair<string, string>("max_fdp", _ruleViolation.GetParam("max_fdp")));
	if (this->_dbData->isLiveMode()) {
		rv->operation_result.insert(pair<string, string>("fdp_discretion", _ruleViolation.GetParam("fdp_discretion")));
		rv->operation_result.insert(pair<string, string>("ft_discretion", _ruleViolation.GetParam("ft_discretion")));
	}
	rv->operation_result.insert(pair<string, string>("complement", _ruleViolation.GetParam("composition")));
	rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
	rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
	rv->operation_result.insert(pair<string, string>("before_duty_odp", before_odp));
	rv->violation_msg = errorMsg;
	_ruleViolation.AddRuleViolations(rv);
}