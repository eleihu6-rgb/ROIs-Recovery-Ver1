/**
 * @file RestrictDhdAndPositionOnFreightForSQRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "RestrictDhdAndPositionOnFreightForSQRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../utils/RosterUtils.h"

namespace {

struct PassengerAlternativeMatch {
	const Segment* violatingSegment{ nullptr };
	const Segment* passengerAlternative{ nullptr };
	std::string violatingRoute;
};

int getScheduledStartOffsetMinutes(const Activity* activity) {
	if (activity == nullptr) {
		return 0;
	}
	return static_cast<int>((activity->getStartTimeLocSch() - activity->getStartTimeUtcSch()) / 60);
}

template <typename Matcher>
const Segment* findPassengerAlternativeInScheduledAndCommuteFlights(const SharedPtr<CrewDataContext>& dbData, Matcher&& matcher) {
	if (dbData == nullptr) {
		return nullptr;
	}

	for (const auto& entry : dbData->flightIdMap) {
		const auto& flight = entry.second;
		if (flight == nullptr) {
			continue;
		}
		if (matcher(flight.get())) {
			return flight.get();
		}
	}

	for (const auto& flight : dbData->pairingInputFerrys) {
		if (flight == nullptr) {
			continue;
		}
		if (matcher(flight)) {
			return flight;
		}
	}

	return nullptr;
}

std::string buildRouteString(const Segment* firstSegment, const Segment* lastSegment) {
	if (firstSegment == nullptr || lastSegment == nullptr) {
		return "";
	}
	return firstSegment->getDepStation() + "-" + lastSegment->getArrStation();
}

std::string buildRouteString(const std::vector<Segment*>& chain) {
	if (chain.empty() || chain.front() == nullptr || chain.back() == nullptr) {
		return "";
	}

	std::string route = chain.front()->getDepStation();
	for (const auto& seg : chain) {
		if (seg == nullptr) {
			continue;
		}
		route += "-" + seg->getArrStation();
	}
	return route;
}

const Segment* findPassengerAlternativeWithin12Hours(const std::string& airline,
	const std::string& depStation,
	const std::string& arrStation,
	time_t startTimeUtcSch,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const SharedPtr<CrewDataContext>& dbData) {
	return findPassengerAlternativeInScheduledAndCommuteFlights(dbData, [&](const Segment* flight) {
		if (!ruleParam.IsPassengerFlight(flight)) {
			return false;
		}
		if (flight->getAirline() != airline)
			return false;
		if (flight->getDepStation() != depStation || flight->getArrStation() != arrStation) {
			return false;
		}
		if (flight->getStartTimeUtcSch() < startTimeUtcSch - 12 * 3600 ||
			flight->getStartTimeUtcSch() > startTimeUtcSch + 12 * 3600) {
			return false;
		}
		return true;
	});
}

bool hasPassengerAlternativeWithin12Hours(const Segment* seg, const SharedPtr<CrewDataContext>& dbData) {
	if (seg == nullptr) {
		return false;
	}
	return false;
}

const Segment* findPassengerAlternativeSameCalendarDay(const std::string& airline,
	const std::string& depStation,
	const std::string& arrStation,
	time_t startTimeUtcSch,
	int startOffsetMinutes,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const SharedPtr<CrewDataContext>& dbData) {
	const time_t segLocalDayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTimeUtcSch, startOffsetMinutes);
	return findPassengerAlternativeInScheduledAndCommuteFlights(dbData, [&](const Segment* flight) {
		if (!ruleParam.IsPassengerFlight(flight)) {
			return false;
		}
		if (flight->getAirline() != airline)
			return false;
		if (flight->getDepStation() != depStation || flight->getArrStation() != arrStation) {
			return false;
		}

		const int flightOffsetMinutes = getScheduledStartOffsetMinutes(flight);
		const time_t flightLocalDayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(flight->getStartTimeUtcSch(), flightOffsetMinutes);
		if (flightLocalDayStartUtc != segLocalDayStartUtc) {
			return false;
		}
		return true;
	});
}

bool hasPassengerAlternativeSameCalendarDay(const Segment* seg, const SharedPtr<CrewDataContext>& dbData) {
	if (seg == nullptr) {
		return false;
	}
	return false;
}


const Segment* findSameFlightNumberPassengerAlternativeSameCalendarDay(const std::string& airline,
	const std::string& depStation,
	const std::string& arrStation,
	time_t startTimeUtcSch,
	int startOffsetMinutes,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const std::vector<ThroughFlightRoutes>& throughFlightRoutes,
	const SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr || depStation == arrStation) {
		return nullptr;
	}

	const time_t segLocalDayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTimeUtcSch, startOffsetMinutes);

	for (auto& route : throughFlightRoutes) {
		if (depStation == route.depStation && arrStation == route.arrStation) {
			for (auto& [firstSeg, secondSeg] : route.throughSegments) {
				// check if same calendar day
				const int firstFlightOffsetMinutes = getScheduledStartOffsetMinutes(firstSeg);
				const time_t firstFlightLocalDayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstSeg->getStartTimeUtcSch(), firstFlightOffsetMinutes);
				if (firstFlightLocalDayStartUtc == segLocalDayStartUtc) {
					return firstSeg;
				}
			}
		}
	}

	return nullptr;
}

const Segment* findSameFlightNumberPassengerAlternativeWithin12Hours(const std::string& airline,
	const std::string& depStation,
	const std::string& arrStation,
	time_t startTimeUtcSch,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const std::vector<ThroughFlightRoutes>& throughFlightRoutes,
	const SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr || depStation == arrStation) {
		return nullptr;
	}

	for (auto& route : throughFlightRoutes) {
		if (depStation == route.depStation && arrStation == route.arrStation) {
			for (auto& [firstSeg, secondSeg] : route.throughSegments) {
				// check if within 12 hours window
				if (firstSeg->getStartTimeUtcSch() < startTimeUtcSch - 12 * 3600 ||
					firstSeg->getStartTimeUtcSch() > startTimeUtcSch + 12 * 3600) {
					return firstSeg;
				}
			}
		}
	}

	return nullptr;
}


const Segment* findSameFlightNumberPassengerAlternative(const std::string& airline,
	const std::string& depStation,
	const std::string& arrStation,
	time_t startTimeUtcSch,
	int startOffsetMinutes,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const std::vector<ThroughFlightRoutes>& throughFlightRoutes,
	const SharedPtr<CrewDataContext>& dbData,
	bool checkSameCalendarDay) {

	if (checkSameCalendarDay) {
		return findSameFlightNumberPassengerAlternativeSameCalendarDay(
			airline, depStation, arrStation, startTimeUtcSch, startOffsetMinutes, ruleParam, throughFlightRoutes, dbData);
	}
	else {
		return findSameFlightNumberPassengerAlternativeWithin12Hours(
			airline, depStation, arrStation, startTimeUtcSch, ruleParam, throughFlightRoutes, dbData);
	}
}

bool matchesDeadheadAssignment(const Segment* seg, const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam) {
	if (seg == nullptr) {
		return false;
	}
	if (ruleParam._deadheadAndPositioningAssignments.empty() ||
		ruleParam._deadheadAndPositioningAssignments[0].empty() ||
		ruleParam._deadheadAndPositioningAssignments[0] == "*") {
		return true;
	}

	return std::find(ruleParam._deadheadAndPositioningAssignments.begin(),
		ruleParam._deadheadAndPositioningAssignments.end(),
		seg->getAssignment()) != ruleParam._deadheadAndPositioningAssignments.end();
}

std::vector<std::string> getScenarioBases(const SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr) {
		return {};
	}
	if (!dbData->scenario.bases.empty()) {
		return dbData->scenario.bases;
	}

	std::vector<std::string> bases;
	bases.reserve(dbData->baseList.size());
	for (const auto& base : dbData->baseList) {
		bases.push_back(base.base);
	}
	return bases;
}

bool isBaseStation(const std::vector<std::string>& bases, const std::string& station) {
	return std::find(bases.begin(), bases.end(), station) != bases.end();
}

PassengerAlternativeMatch findChainViolationSegment(const std::vector<Segment*>& dutySegments,
	const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam,
	const std::vector<std::string>& bases,
	const std::vector<ThroughFlightRoutes>& throughFlightRoutes,
	const SharedPtr<CrewDataContext>& dbData) {
	std::vector<Segment*> currentChain;
	const auto evaluateChain = [&](const std::vector<Segment*>& chain) -> PassengerAlternativeMatch {
		if (chain.size() < 2) {
			return {};
		}

		const Segment* firstFreightDeadhead = nullptr;
		for (const auto& seg : chain) {
			if (ruleParam.MatchFreightDhdSegment(seg)) {
				firstFreightDeadhead = seg;
				break;
			}
		}
		if (firstFreightDeadhead == nullptr) {
			return {};
		}

		const Segment* firstSegment = chain.front();
		const Segment* lastSegment = chain.back();
		const bool startsAtBase = isBaseStation(bases, firstSegment->getDepStation());
		if (!ruleParam.MatchHomeBase(startsAtBase)) {
			return {};
		}

		const Segment* passengerAlternative = startsAtBase
			? findPassengerAlternativeSameCalendarDay(
				firstSegment->getAirline(),
				firstSegment->getDepStation(),
				lastSegment->getArrStation(),
				firstSegment->getStartTimeUtcSch(),
				getScheduledStartOffsetMinutes(firstSegment),
				ruleParam,
				dbData)
			: findPassengerAlternativeWithin12Hours(
				firstSegment->getAirline(),
				firstSegment->getDepStation(),
				lastSegment->getArrStation(),
				firstSegment->getStartTimeUtcSch(),
				ruleParam,
				dbData);
		if (passengerAlternative == nullptr) {
			passengerAlternative = findSameFlightNumberPassengerAlternative(
				firstSegment->getAirline(),
				firstSegment->getDepStation(),
				lastSegment->getArrStation(),
				firstSegment->getStartTimeUtcSch(),
				getScheduledStartOffsetMinutes(firstSegment),
				ruleParam,
				throughFlightRoutes,
				dbData,
				startsAtBase);
		}
		if (passengerAlternative == nullptr) {
			return {};
		}
		return { firstFreightDeadhead, passengerAlternative, buildRouteString(chain) };
	};

	for (const auto& seg : dutySegments) {
		if (matchesDeadheadAssignment(seg, ruleParam)) {
			currentChain.push_back(seg);
			continue;
		}

		if (PassengerAlternativeMatch match = evaluateChain(currentChain); match.passengerAlternative != nullptr) {
			return match;
		}
		currentChain.clear();
	}

	return evaluateChain(currentChain);
}

}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckRule(const Duty* duty) const {
	const std::vector<std::string> bases = getScenarioBases(this->GetDataContext());
	return CheckSingleDuty(duty, bases);
}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty())
		return true;

	bool passAllDuties = true;
	const std::vector<std::string> bases = getScenarioBases(this->GetDataContext());
	for (const auto& duty : duties) {
		const bool passDuty = CheckSingleDuty(duty, bases);
		if (!passDuty && this->_application == PAIRING_OPTIMIZER) {
			return false;
		}
		if (!passDuty) {
			passAllDuties = false;
		}
	}
	return passAllDuties;
}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckSingleDuty(const Duty* duty, const std::vector<std::string>& bases) const {
	if (duty == nullptr) {
		return true;
	}

	bool passAllRule = true;
	const auto& segments = duty->getSegmentsRead();

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		const PassengerAlternativeMatch chainMatch = findChainViolationSegment(segments, ruleParam, bases, _getThroughFlightRoutes(), this->GetDataContext());
		if (chainMatch.passengerAlternative != nullptr && chainMatch.violatingSegment != nullptr) {
			passAllRule = false;
			if (this->_application == PAIRING_OPTIMIZER) {
				return false;
			}
			ThrowRuleViolation(chainMatch.violatingSegment, chainMatch.violatingRoute, chainMatch.passengerAlternative);
			continue;
		}

		for (const auto& seg : segments) {
			const bool startsAtBase = isBaseStation(bases, seg->getDepStation());
			if (!ruleParam.MatchFreightDhdSegment(seg) || !ruleParam.MatchHomeBase(startsAtBase)) {
				continue;
			}

			const bool pass = startsAtBase
				? CheckHomeBaseFlight(seg, ruleParam)
				: CheckOutsideFlight(seg, ruleParam);
			if (pass) {
				continue;
			}
			const Segment* passengerAlternative = startsAtBase
				? findPassengerAlternativeSameCalendarDay(
					seg->getAirline(),
					seg->getDepStation(),
					seg->getArrStation(),
					seg->getStartTimeUtcSch(),
					getScheduledStartOffsetMinutes(seg),
					ruleParam,
					this->GetDataContext())
				: findPassengerAlternativeWithin12Hours(
					seg->getAirline(),
					seg->getDepStation(),
					seg->getArrStation(),
					seg->getStartTimeUtcSch(),
					ruleParam,
					this->GetDataContext());
			if (passengerAlternative == nullptr) {
				passengerAlternative = findSameFlightNumberPassengerAlternative(
					seg->getAirline(),
					seg->getDepStation(),
					seg->getArrStation(),
					seg->getStartTimeUtcSch(),
					getScheduledStartOffsetMinutes(seg),
					ruleParam,
					_getThroughFlightRoutes(),
					this->GetDataContext(),
					startsAtBase);
			}

			passAllRule = false;
			if (this->_application == PAIRING_OPTIMIZER) {
				return false;
			}
			ThrowRuleViolation(seg, buildRouteString(seg, seg), passengerAlternative);
		}
	}
	return passAllRule;
}

const std::vector<ThroughFlightRoutes>& RestrictDhdAndPositionOnFreightForSQRule::_getThroughFlightRoutes() const {
	std::call_once(_throughFlightRoutesOnce, [&]() {
		const auto& dbData = this->GetDataContext();
		if (dbData == nullptr) {
			return;
		}

		std::unordered_map<std::string, std::vector<const Segment*>> flightNumberToSegments;
		std::vector<const Segment*> firstThroughSegments;
		for (const auto& flight : dbData->pairingInputFerrys) {
			flightNumberToSegments[flight->getFlightNumber()].push_back(flight);
		}

		for (auto& [fltNum, segs] : flightNumberToSegments) {
			for (auto firstSeg : segs) {
				for (auto secondSeg : segs) {
					if (firstSeg == secondSeg)
						continue;
					if (firstSeg->getArrStation() == secondSeg->getDepStation()) {
						firstThroughSegments.push_back(firstSeg);
					}
				}
			}
		}

		for (auto segment : firstThroughSegments) {
			auto it = flightNumberToSegments.find(segment->getFlightNumber());
			for (auto secondSeg : it->second) {
				if (secondSeg->getDepStation() == segment->getArrStation()
					&& secondSeg->getStartTimeUtcAct() >= segment->getEndTimeUtcAct()
					&& secondSeg->getStartTimeUtcAct() < segment->getEndTimeUtcAct() + 24 * 3600) {

					auto it = std::find_if(_cachedThroughFlightRoutes.begin(), _cachedThroughFlightRoutes.end(), [&](const ThroughFlightRoutes& r) {
						return r.depStation == segment->getDepStation() &&
							r.arrStation == secondSeg->getArrStation() &&
							r.flightNumber == segment->getFlightNumber();
					});
					if (it == _cachedThroughFlightRoutes.end()) {
						ThroughFlightRoutes route;
						route.depStation = segment->getDepStation();
						route.arrStation = secondSeg->getArrStation();
						route.flightNumber = segment->getFlightNumber();
						route.throughSegments.emplace_back(segment, secondSeg);
						_cachedThroughFlightRoutes.push_back(std::move(route));
					}
					else {
						it->throughSegments.emplace_back(segment, secondSeg);
					}
				}
			}
		}
	});
	return _cachedThroughFlightRoutes;
}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckHomeBaseFlight(const Segment* seg, const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam) const {
	if (seg == nullptr) {
		return true;
	}
	if (findPassengerAlternativeSameCalendarDay(
		seg->getAirline(),
		seg->getDepStation(),
		seg->getArrStation(),
		seg->getStartTimeUtcSch(),
		getScheduledStartOffsetMinutes(seg),
		ruleParam,
		this->GetDataContext()) != nullptr) {
		return false;
	}
	if (findSameFlightNumberPassengerAlternative(
		seg->getAirline(),
		seg->getDepStation(),
		seg->getArrStation(),
		seg->getStartTimeUtcSch(),
		getScheduledStartOffsetMinutes(seg),
		ruleParam,
		_getThroughFlightRoutes(),
		this->GetDataContext(),
		true) != nullptr) {
		return false;
	}
	return true;
}

bool RestrictDhdAndPositionOnFreightForSQRule::CheckOutsideFlight(const Segment* seg, const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam) const {
	if (seg == nullptr) {
		return true;
	}
	if (findPassengerAlternativeWithin12Hours(
		seg->getAirline(),
		seg->getDepStation(),
		seg->getArrStation(),
		seg->getStartTimeUtcSch(),
		ruleParam,
		this->GetDataContext()) != nullptr) {
		return false;
	}
	if (findSameFlightNumberPassengerAlternative(
		seg->getAirline(),
		seg->getDepStation(),
		seg->getArrStation(),
		seg->getStartTimeUtcSch(),
		getScheduledStartOffsetMinutes(seg),
		ruleParam,
		_getThroughFlightRoutes(),
		this->GetDataContext(),
		false) != nullptr) {
		return false;
	}
	return true;
}

void RestrictDhdAndPositionOnFreightForSQRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestrictDhdAndPositionOnFreightForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestrictDhdAndPositionOnFreightForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void RestrictDhdAndPositionOnFreightForSQRule::ThrowRuleViolation(const Segment* segment, const std::string& violatingRoute, const Segment* passengerAlternative) const {
	std::string msg = "Positioning or deadheading on the freighter aircraft shall not be required if there is a scheduled Company passenger flight.";
	if (!violatingRoute.empty()) {
		msg += " Violating route: " + violatingRoute + ".";
	}
	if (passengerAlternative != nullptr) {
		msg += " Use passenger flight: " + passengerAlternative->getAirline() + passengerAlternative->getFlightNumber()
			+ " " + passengerAlternative->getDepStation() + "-" + passengerAlternative->getArrStation() + ".";
	}
	Pairing* pairing = nullptr;
	if (this->_dbData != nullptr) {
		const auto pairingIt = this->_dbData->pairingIdMap.find(segment->getPairingId());
		if (pairingIt != this->_dbData->pairingIdMap.end()) {
			pairing = pairingIt->second;
		}
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = RestrictDhdAndPositionOnFreightForSQRule::RuleFuncId;
	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
		if (pairing != nullptr) {
			_ruleViolation.SetLegalityMessage(pairing, msg);
		}

		if (this->_dbData != nullptr) {
			const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
			if (crewIndex >= 0 && crewIndex < static_cast<int>(this->_dbData->crewList.size())) {
				SharedPtr<CREW> ppCrew = this->_dbData->crewList[crewIndex];
				if (ppCrew != nullptr) {
					const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, segment->getPairingId());
					rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
					rv->crewId = ppCrew->idCrew;
					_ruleViolation.SetLegalityMessage(ppCrew, msg);
				}
			}
		}
	}
	else {
		if (pairing != nullptr) {
			_ruleViolation.SetLegalityMessage(pairing, msg);
		}
		else {
			_ruleViolation.SetLegalityMessage(const_cast<Segment*>(segment), msg);
		}
	}
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	_ruleViolation.AddRuleViolations(rv);
}
