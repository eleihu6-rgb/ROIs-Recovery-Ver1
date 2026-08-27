#include "CheckMaxFlightDutyPeriodRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "MaxFlightDutyPeriodRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../utils/PhaseUtils.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"

namespace {
std::string GetPairingBaseForDuty(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	if (duty == nullptr || dbData == nullptr) {
		return "";
	}

	const auto itPairing = dbData->pairingIdMap.find(duty->getPairingId());
	if (itPairing == dbData->pairingIdMap.end() || itPairing->second == nullptr) {
		return "";
	}

	return itPairing->second->getBase();
}

time_t AdjustCheckInByMaxFdpBrief(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, time_t currentCheckInUtc) {
	if (duty == nullptr || dbData == nullptr) {
		return currentCheckInUtc;
	}

	const std::string pairingBase = GetPairingBaseForDuty(duty, dbData);
	const int normalBrief = RuleParams::CalculateDutyBrief(duty, dbData, pairingBase, RuleParams::DUTY_BRIEF_FIELD);
	const int maxFdpBrief = RuleParams::CalculateDutyBrief(duty, dbData, pairingBase, RuleParams::DUTY_MAX_FDP_BRIEF_FIELD);
	if (normalBrief < 0 || maxFdpBrief < 0) {
		return currentCheckInUtc;
	}

	return currentCheckInUtc + static_cast<time_t>(normalBrief - maxFdpBrief) * 60;
}
}

bool CheckMaxFlightDutyPeriodRule::CheckRule(const Duty* duty) const {

	if (this->_ruleParams.empty()) {
		return true;
	}

	if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
		return this->CheckAcclimatizeDuty(duty);
	}
	else {
		return this->CheckUnkownDuty(duty);
	}

}

bool CheckMaxFlightDutyPeriodRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	for (const auto & roster : rosters) {
		for (auto duty : roster->pairing->getDutyVec()) {
			if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
				return this->CheckAcclimatizeDuty(duty, roster);
			}
			else {
				return this->CheckUnkownDuty(duty, roster);
			}
		}
	}
	return true;
}

bool CheckMaxFlightDutyPeriodRule::CheckAcclimatizeDuty(const Duty* duty, const ROSTER* roster) const {
	
	int fdpDiscretionMinutes = 0;
	if (duty->supportDiscretionType(DiscretionType::FDP)) {
		fdpDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::FDP);
	}

	for (const auto & _ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, _ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (_ruleParam._odpUpper != 0) {
			continue;
		}
		if (_ruleParam._maxFdp > 0) {


			//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
			//calculatePairingDutyTimes(duty, this->_dbData.get());

			time_t checkin = AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcAct());//getStartTime();

			// 加上适应的时区秒数
			checkin += duty->getRefTimeZone() * 60;
			//checkin = Utility::GetInstance().getLocalTime(checkin,duty->getDepStation());
			long fdp = duty->getFDPInSecs();
			long dp = duty->getDPInSecs();
			long ft = const_cast<Duty*>(duty)->getBLKInMins() * 60;

			int landing = GetDutyLandingNumber(duty, _ruleParam._landingAssignments);

			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				//duty->setCompositionName(strComplement);
			}
			string strBase = duty->getDepStation();
			bool bIsBunk = true;
			auto offsetMinutes = duty->getRefTimeZone();

			int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
			int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());

			bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
			if (isInRange && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
				) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				bool valid = true;
				int increaseMaxFdp = _ruleParam._maxFdp;

				const auto & increaseFDPMap = const_cast<Duty*>(duty)->getDutyDelta().getFDPMinutes();
				for (const auto & map : increaseFDPMap) {
					increaseMaxFdp += map.second;
				}
				
				increaseMaxFdp += fdpDiscretionMinutes;

				if (_ruleParam._maxFdp > 0 && fdp > increaseMaxFdp * 60) {
					_ruleViolation.SetParam("current_fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60));
					_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(_ruleParam._maxFdp));
					_ruleViolation.SetParam("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretionMinutes));
					valid = false;
				}

				if (!valid) {
					_ruleViolation.SetParam("composition", strComplement);
					_ruleViolation.SetParam("duty_start", std::to_string(duty->getStartTimeUtcAct()));
					_ruleViolation.SetParam("duty_end", std::to_string(duty->getEndTimeUtcAct()));
					_ruleViolation.SetParam("duty_start", std::to_string(duty->getStartTimeUtcAct()));
					_ruleViolation.SetParam("duty_end", std::to_string(duty->getEndTimeUtcAct()));
					_ruleViolation.SetParam("pairing_id", std::to_string(duty->getPairingId()));
					_ruleViolation.SetParam("duty_seq", std::to_string(duty->getDutySeq()));
					_ruleViolation.SetParam("landings", std::to_string(landing));
					if (roster) {
						_ruleViolation.SetParam("crew_id", roster->idcrew);
						_ruleViolation.SetParam("roster_id", std::to_string(roster->rosterId));
					}
					ThrowRuleViolation();
					return valid;
				}

				return true;
			}
		}
	}
	return true;
}

bool CheckMaxFlightDutyPeriodRule::CheckUnkownDuty(const Duty* duty, const ROSTER* roster) const {

	int fdpDiscretionMinutes = 0;
	if (duty->supportDiscretionType(DiscretionType::FDP)) {
		fdpDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::FDP);
	}

	// 获取前一个任务的ODP
	int beforeDutyODP = 0;

	int rosterIndex = 0;
	if (roster) rosterIndex = roster->indexInRosterListOfCrew;
	// 如果是第一个duty，找前一个pairing的lastDuty
	// 如果没有roster，无法确定crew，无法找到前序任务，则默认是适应
	// 如果roster是第一个，无前序任务，则默认适应

	if (this->_application == PAIRING_OPTIMIZER) {
		return this->CheckAcclimatizeDuty(duty);
	}

	if (duty->getDutySeq() == 1 && (roster == NULL || rosterIndex == 0)) {
		return this->CheckAcclimatizeDuty(duty);
	}
	else if (duty->getDutySeq() == 1) {

		const auto & prevPairing = this->_dbData->crewIdMap.at(roster->idcrew)->rosterList.at(rosterIndex - 1)->pairing;
		const auto & prevLastDuty = prevPairing->getLastDuty();

		beforeDutyODP = static_cast<int>(duty->getStartTimeUtcAct() - prevLastDuty->getEndTimeUtcAct());
	}
	// 查找同一个pairing里，前一个duty
	else {
		const auto & pairing = this->_dbData->pairingIdMap.at(duty->getPairingId());
		const auto & prevDuty = pairing->getDuty(duty->getDutySeq() - 2);
		beforeDutyODP = static_cast<int>(duty->getStartTimeUtcAct() - prevDuty->getEndTimeUtcAct());
	}
	
	long fdp = duty->getFDPInSecs();
	long dp = duty->getDPInSecs();
	long ft = const_cast<Duty*>(duty)->getBLKInMins() * 60;

	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		//duty->setCompositionName(strComplement);
	}

	for (const auto & _ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, _ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		int landing = GetDutyLandingNumber(duty, _ruleParam._landingAssignments);
		if (_ruleParam._odpLower && _ruleParam._odpUpper) {
			if (_ruleParam._odpLower * 60 <= beforeDutyODP && _ruleParam._odpUpper * 60 > beforeDutyODP
				&& landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower
				&& (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
					) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				bool valid = true;
				int increaseMaxFdp = _ruleParam._maxFdp;
				
				const auto & increaseFDPMap = const_cast<Duty*>(duty)->getDutyDelta().getFDPMinutes();
				for (const auto & map : increaseFDPMap) {
					increaseMaxFdp += map.second;
				}
				increaseMaxFdp += fdpDiscretionMinutes;

				if (_ruleParam._maxFdp > 0 && fdp > increaseMaxFdp * 60) {
					_ruleViolation.SetParam("current_fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60));
					_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(_ruleParam._maxFdp));
					_ruleViolation.SetParam("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretionMinutes));
					valid = false;
				}

				if (!valid) {
					_ruleViolation.SetParam("composition", strComplement);
					_ruleViolation.SetParam("duty_start", std::to_string(duty->getStartTimeUtcAct()));
					_ruleViolation.SetParam("duty_end", std::to_string(duty->getEndTimeUtcAct()));
					_ruleViolation.SetParam("duty_start", std::to_string(duty->getStartTimeUtcAct()));
					_ruleViolation.SetParam("duty_end", std::to_string(duty->getEndTimeUtcAct()));
					_ruleViolation.SetParam("pairing_id", std::to_string(duty->getPairingId()));
					_ruleViolation.SetParam("duty_seq", std::to_string(duty->getDutySeq()));
					_ruleViolation.SetParam("landings", std::to_string(landing));
					if (roster) {
						_ruleViolation.SetParam("crew_id", roster->idcrew);
						_ruleViolation.SetParam("roster_id", std::to_string(roster->rosterId));
					}
					ThrowRuleViolation();
					return valid;
				}
			}
		}
	}
	return true;
}

void CheckMaxFlightDutyPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}


void CheckMaxFlightDutyPeriodRule::ThrowRuleViolation() const {

	vector<string> errorMsgs;
	if (!_ruleViolation.GetParam("max_fdp").empty()) {
		string msg = "Flight duty period ({0:current_fdp}) is more than the limitation ({1:max_fdp})";
		msg = StringUtils::Format(msg, _ruleViolation.GetParam("current_fdp"), _ruleViolation.GetParam("max_fdp"));
		errorMsgs.emplace_back(msg);
	}
	if (!_ruleViolation.GetParam("max_dp").empty()) {

		string msg = "Duty period ({0:current_dp}) is more than the limitation ({1:max_dp})";
		msg = StringUtils::Format(msg, _ruleViolation.GetParam("current_dp"), _ruleViolation.GetParam("max_dp"));
		errorMsgs.emplace_back(msg);
		
	}
	if (!_ruleViolation.GetParam("max_ft").empty()) {
		string msg = "Flight time ({0:current_ft}) is more than the limitation ({1:max_ft})";
		msg = StringUtils::Format(msg, _ruleViolation.GetParam("current_ft"), _ruleViolation.GetParam("max_ft"));
		errorMsgs.emplace_back(msg);
	}
	if (this->_dbData->isLiveMode() && !_ruleViolation.GetParam("fdp_discretion").empty()) {
		string msg = "FDP discretion used ({0:fdp_discretion})";
		msg = StringUtils::Format(msg, _ruleViolation.GetParam("fdp_discretion"));
		errorMsgs.emplace_back(msg);
	}
	string errorMsg = "";
	for (auto& msg : errorMsgs) {
		errorMsg += (msg + ", ");
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
		errorMsg += " Operational duty period before duty (" + before_odp + ").";
	}

	string crewid = _ruleViolation.GetParam("crew_id");
	string rosterId = _ruleViolation.GetParam("roster_id");
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->pairingId = stoi(_ruleViolation.GetParam("pairing_id"));
	rv->dutySequenceNumber = stoi(_ruleViolation.GetParam("duty_seq"));
	rv->idRule = _ruleParams[0].GetId();
	rv->startDTUtc = stol(_ruleViolation.GetParam("duty_start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("duty_end"));
	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	if (!crewid.empty()) {
		rv->crewId = crewid;
		rv->rosterId = stoll(rosterId);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("ruleId", "6007.2"));
	rv->operation_result.insert(pair<string, string>("fdp", _ruleViolation.GetParam("current_fdp")));
	rv->operation_result.insert(pair<string, string>("max_fdp", _ruleViolation.GetParam("max_fdp")));
	if (this->_dbData->isLiveMode()) {
		rv->operation_result.insert(pair<string, string>("fdp_discretion", _ruleViolation.GetParam("fdp_discretion")));
	}
	rv->operation_result.insert(pair<string, string>("complement", _ruleViolation.GetParam("composition")));
	rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
	rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
	rv->operation_result.insert(pair<string, string>("before_duty_odp", before_odp));
	rv->violation_msg = errorMsg;
	_ruleViolation.AddRuleViolations(rv);
}

int CheckMaxFlightDutyPeriodRule::GetDutyLandingNumber(const Duty* duty, std::vector<std::string> landingAssignments) const {
	if (landingAssignments.size() == 0)
		return duty->getNumFlySegs();

	if (landingAssignments.at(0) == "*")
		return (int)duty->getSegments().size();

	int num = 0;
	for (const auto & seg : duty->getSegments()) {
		if (find(landingAssignments.begin(), landingAssignments.end(), seg->getAssignment()) != landingAssignments.end())
			++num;
	}
	return num;
}
