/**
 * @file CheckMinSpaceBetweenDutyForF8Rule.cpp
 * @brief Min rest between duties for Flair (F8), mirrored from 7323 (PR).
**/

#include "CheckMinSpaceBetweenDutyForF8Rule.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include <climits>
#include "framework/period/WorkPeriod.h"
#include "Duty.h"
#include "utils/RosterUtils.h"
#include "TimezoneUtils.h"

namespace {

	// Roster row: same semantics as RestPeriod::GetWorkEndTimeUTCForRoster / GetWorkEndTimeLocForRoster (8056 Utilize Post Rest).
	time_t RosterRestGapStartUtc(const ROSTER* r, bool utilizePostRest) {
		if (r == nullptr)
			return 0;
		if (r->pairing == nullptr)
			return utilizePostRest ? r->actRestStrUtc : r->actEndUtc;
		return utilizePostRest ? r->pairing->getEndTimeUtcAct() : r->pairing->getEndTimeIncludingRestUtcAct();
	}

	// Duty / WorkPeriod timeline (FltDuty): Y = duty end (+ dropoff); N = plus actualRest (post-rest), aligned with pairing endIncludingRest.
	// Non-flight work periods keep segment end only (Utilize Post Rest applies via roster row path for pairing-level checks).
	time_t WorkPeriodRestGapStartUtc(const WorkPeriod* wp, bool utilizePostRest) {
		if (wp == nullptr)
			return 0;
		if (wp->GetWorkType() != WorkType::FltDuty)
			return wp->GetEndTimeUTC();
		const auto* d = static_cast<const Duty*>(wp->GetWork());
		time_t t = wp->GetEndTimeUTC();
		if (utilizePostRest)
			return t;
		const int ar = d->getActualRest();
		return t + (ar > 0 ? static_cast<time_t>(ar) * 60 : 0);
	}

	time_t DutyRestGapStartUtc(const Duty* d, bool utilizePostRest) {
		if (d == nullptr)
			return 0;
		time_t t = d->getEndTimeUtcAct() + static_cast<time_t>(d->getMinDropoff()) * 60;
		if (utilizePostRest)
			return t;
		const int ar = d->getActualRest();
		return t + (ar > 0 ? static_cast<time_t>(ar) * 60 : 0);
	}
}

bool CheckMinSpaceBetweenDutyForF8Rule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crewId = rosters[0]->idcrew;
	const auto& crew = this->_dbData->crewIdMap[crewId];

	bool needDutyWorkPeriods = false;
	for (const auto& p : _ruleParams) {
		if (p.GetClassType() == RuleClassType::PO)
			continue;
		if (!p.isRosterPairingLevel()) {
			needDutyWorkPeriods = true;
			break;
		}
	}

	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	if (needDutyWorkPeriods)
		workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
	if (needDutyWorkPeriods && workPeriods.empty())
		return true;

	const int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crew->getPrimeBase(), this->GetDataContext());

	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO)
			continue;
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);
		_ruleViolation.SetParam("period", to_string(_ruleParam._minPeriod));
		_ruleViolation.SetParam("unit", _ruleParam._unit);

		if (_ruleParam.isRosterPairingLevel()) {
			std::vector<size_t> prevIdx;
			std::vector<size_t> nextIdx;
			prevIdx.reserve(rosters.size());
			nextIdx.reserve(rosters.size());
			for (size_t k = 0; k < rosters.size(); ++k) {
				if (_ruleParam.MatchesPrevPairingPattern(rosters[k], offsetTZMinutes))
					prevIdx.push_back(k);
				if (_ruleParam.MatchesNextPairingPattern(rosters[k], offsetTZMinutes))
					nextIdx.push_back(k);
			}

			for (size_t pi : prevIdx) {
				for (size_t ni : nextIdx) {
					if (pi >= ni)
						continue;

					const ROSTER* currentRoster = rosters[pi];
					const ROSTER* nextRoster = rosters[ni];

					if (_ruleParam.GetClassType() == RuleClassType::RO) {
						if (currentRoster && nextRoster && currentRoster->pairId && nextRoster->pairId && currentRoster->pairId == nextRoster->pairId)
							continue;
					}

					const time_t spanStartUtc = currentRoster->actStrUtc;
					const time_t spanEndUtc = RosterRestGapStartUtc(currentRoster, _ruleParam._utilizePostRest);
					if (!_ruleParam.MatchCrewQualification(crew, spanStartUtc, spanEndUtc))
						continue;

					const time_t gapStartUtc = RosterRestGapStartUtc(currentRoster, _ruleParam._utilizePostRest);
					const time_t gapEndUtc = nextRoster->getStartTimeUtcAct();

					string currentRosterZoneId = this->GetDataContext()->getAirportZoneId(currentRoster->origin);
					int currentRosterOffset = TimezoneUtils::GetTimezoneOffset(gapStartUtc, currentRosterZoneId);
					string nextRosterZoneId = this->GetDataContext()->getAirportZoneId(nextRoster->origin);
					int nextRosterOffset = TimezoneUtils::GetTimezoneOffset(gapEndUtc, nextRosterZoneId);

					if (!_ruleParam.CheckMinRest(gapStartUtc, gapEndUtc, currentRosterOffset, nextRosterOffset)) {
						if (this->_application == ROSTER_OPTIMIZER)
							return false;
						_ruleViolation.SetParam("start", to_string(gapStartUtc));
						_ruleViolation.SetParam("end", to_string(gapEndUtc));

						time_t gapStartLocal = TimezoneUtils::GetLocalTime(gapStartUtc, currentRosterZoneId);
						time_t gapEndLocal = TimezoneUtils::GetLocalTime(gapEndUtc, nextRosterZoneId);
						_ruleViolation.SetParam("start_loc", to_string(gapStartLocal));
						_ruleViolation.SetParam("end_loc", to_string(gapEndLocal));
						ThrowRuleViolation();
					}
				}
			}
		}
		else {
			std::vector<size_t> prevIdx;
			std::vector<size_t> nextIdx;
			prevIdx.reserve(workPeriods.size());
			nextIdx.reserve(workPeriods.size());
			for (size_t k = 0; k < workPeriods.size(); ++k) {
				if (_ruleParam.MatchesPrevDutyPattern(workPeriods[k].get(), offsetTZMinutes))
					prevIdx.push_back(k);
				if (_ruleParam.MatchesNextDutyPattern(workPeriods[k].get(), offsetTZMinutes))
					nextIdx.push_back(k);
			}

			for (size_t pi : prevIdx) {
				for (size_t ni : nextIdx) {
					if (pi >= ni)
						continue;

					auto& currentWorkPeriod = workPeriods.at(pi);
					auto& nextWorkPeriod = workPeriods.at(ni);

					if (_ruleParam.GetClassType() == RuleClassType::RO) {
						const auto currentRoster = currentWorkPeriod->GetRoster();
						const auto nextRoster = nextWorkPeriod->GetRoster();
						if (currentRoster && nextRoster && currentRoster->pairId && nextRoster->pairId && currentRoster->pairId == nextRoster->pairId)
							continue;
					}

					const time_t restGapStartUtc = WorkPeriodRestGapStartUtc(currentWorkPeriod.get(), _ruleParam._utilizePostRest);
					if (!_ruleParam.MatchCrewQualification(crew, currentWorkPeriod->GetStartTimeUTC(), restGapStartUtc))
						continue;

					const time_t gapStartUtc = WorkPeriodRestGapStartUtc(currentWorkPeriod.get(), _ruleParam._utilizePostRest);
					const time_t gapEndUtc = nextWorkPeriod->GetStartTimeUTC();

					string currentWorkPeriodZoneId = this->GetDataContext()->getAirportZoneId(currentWorkPeriod->GetEndStation());
					int currentWorkPeriodOffset = TimezoneUtils::GetTimezoneOffset(gapStartUtc, currentWorkPeriodZoneId);
					string nextWorkPeriodZoneId = this->GetDataContext()->getAirportZoneId(nextWorkPeriod->GetStartStation());
					int nextWorkPeriodOffset = TimezoneUtils::GetTimezoneOffset(gapEndUtc, nextWorkPeriodZoneId);

					if (!_ruleParam.CheckMinRest(gapStartUtc, gapEndUtc, currentWorkPeriodOffset, nextWorkPeriodOffset)) {
						if (this->_application == ROSTER_OPTIMIZER)
							return false;
						_ruleViolation.SetParam("start", to_string(gapStartUtc));
						_ruleViolation.SetParam("end", to_string(gapEndUtc));

						time_t gapStartLocal = TimezoneUtils::GetLocalTime(gapStartUtc, currentWorkPeriodZoneId);
						time_t gapEndLocal = TimezoneUtils::GetLocalTime(gapEndUtc, nextWorkPeriodZoneId);
						_ruleViolation.SetParam("start_loc", to_string(gapStartLocal));
						_ruleViolation.SetParam("end_loc", to_string(gapEndLocal));
						ThrowRuleViolation();
					}
				}
			}
		}
	}

	return passAllRule;

}

bool CheckMinSpaceBetweenDutyForF8Rule::CheckRule(const Pairing* pairing) const {
	if (pairing->getDutyVec().size() == 1)
		return true;
	bool valid = true;
	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::RO)
			continue;
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));
		_ruleViolation.SetParam("period", to_string(_ruleParam._minPeriod));
		_ruleViolation.SetParam("unit", _ruleParam._unit);

		for (size_t i = 0; i < pairing->getDutyVec().size() - 1; i++) {
			auto& currentWorkPeriod = pairing->getDutyVec().at(i);
			auto& nextWorkPeriod = pairing->getDutyVec().at(i + 1);

			if (_ruleParam.MatchRuleParam(currentWorkPeriod, nextWorkPeriod)) {
				if (_ruleParam.prevAttributesRequireWocl() || _ruleParam.nextAttributesRequireWocl()) {
					int fallbackOffset = pairing->getDutyVec().front()->getRefTimeZone();
					if (fallbackOffset == INT_MIN)
						fallbackOffset = 0;
					if (_ruleParam.prevAttributesRequireWocl() && !_ruleParam.matchPrevWoclShapeInPairing(currentWorkPeriod, pairing, fallbackOffset))
						continue;
					if (_ruleParam.nextAttributesRequireWocl() && !_ruleParam.matchNextWoclShapeInPairing(nextWorkPeriod, pairing, fallbackOffset))
						continue;
				}
				const time_t gapStartUtc = DutyRestGapStartUtc(currentWorkPeriod, _ruleParam._utilizePostRest);
				const time_t gapEndUtc = nextWorkPeriod->getStartTimeUtcAct() - nextWorkPeriod->getMinPickup() * 60;

				string currentWorkPeriodZoneId = this->GetDataContext()->getAirportZoneId(currentWorkPeriod->getArrivalStation());
				int currentWorkPeriodOffset = TimezoneUtils::GetTimezoneOffset(gapStartUtc, currentWorkPeriodZoneId);
				string nextWorkPeriodZoneId = this->GetDataContext()->getAirportZoneId(nextWorkPeriod->getDepartureStation());
				int nextWorkPeriodOffset = TimezoneUtils::GetTimezoneOffset(gapEndUtc, nextWorkPeriodZoneId);
				
				if (!_ruleParam.CheckMinRest(gapStartUtc, gapEndUtc, currentWorkPeriodOffset, nextWorkPeriodOffset)) {
					valid = false;
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					_ruleViolation.SetParam("start", to_string(DutyRestGapStartUtc(currentWorkPeriod, _ruleParam._utilizePostRest)));
					_ruleViolation.SetParam("end", to_string(nextWorkPeriod->getStartTimeUtcAct()));
					_ruleViolation.SetParam("start_loc", to_string(gapStartUtc));
					_ruleViolation.SetParam("end_loc", to_string(gapEndUtc));
					ThrowRuleViolation();
				}
			}
		}
	}
	return valid;
}

void CheckMinSpaceBetweenDutyForF8Rule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = _ruleViolation.GetParam("pairing_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string startLoc = TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("start_loc"), 0));
	string endLoc = TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("end_loc"), 0));
	const auto& period = _ruleViolation.GetParam("period");
	const auto& unit = _ruleViolation.GetParam("unit");
	string msg = "The space between duty({0:startLoc} - {1:endLoc}) is less than the minumum rest time ({2:period} {3:unit}).";
	msg = StringUtils::Format(msg, startLoc, endLoc, period, unit);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crewId.empty()) {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		rv->pairingId = stoll(pairingId);
	}
	else {
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		rv->crewId = crewId;
	}

	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMinSpaceBetweenDutyForF8Rule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinSpaceBetweenDutyForF8RuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
