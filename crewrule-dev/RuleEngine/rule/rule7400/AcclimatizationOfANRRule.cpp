/**
 * @file AcclimatizationOfANRRule.cpp
 */

#include "AcclimatizationOfANRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "TimezoneUtils.h"
#include "../constant/Constants.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/BaseUtils.h"

using namespace std;

namespace {
	constexpr int SecondsInDay = 24 * 3600;

    int GetDepartureOffsetMinutes(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
        if (duty == nullptr || dbData == nullptr) {
            return 0;
        }
        return DutyUtils::GetTimeZoneOffset(*duty, dbData);
    }

    std::string GetRestZoneId(const Duty* prevDuty, const Duty* currDuty, const SharedPtr<CrewDataContext>& dbData) {
        if (currDuty != nullptr && dbData != nullptr) {
            const std::string depZoneId = dbData->getAirportZoneId(currDuty->getDepartureStation());
            if (!depZoneId.empty()) {
                return depZoneId;
            }
        }
        if (prevDuty != nullptr && dbData != nullptr) {
            return dbData->getAirportZoneId(prevDuty->getArrivalStation());
        }
        return {};
    }

    std::pair<long long, long long> GetRestWindowUtc(const Duty* prevDuty, const Duty* currDuty) {

        auto dropoff = prevDuty->getActualDropoffMin();
        if (dropoff <= 0) {
            dropoff = prevDuty->getMinDropoff();
        }
        const auto restStartUtc = prevDuty->getEndTimeUtcAct() + dropoff * 60;
        const auto restEndUtc = currDuty->getStartTimeUtcAct();
		return { restStartUtc, restEndUtc };
    }
}

void AcclimatizationOfANRRule::CalculateDuty(Pairing* pairing) {
    if (_ruleParams.empty() || pairing == nullptr) {
        return;
    }
    auto duties = pairing->getDutyVec();
    CalculateDuty(duties);
}

void AcclimatizationOfANRRule::CalculateDuty(Duty* duty) {
    if (_ruleParams.empty() || duty == nullptr) {
        return;
    }
    const auto& ruleParam = _ruleParams.front();
    // In PO duty-build flow, initialise the duty as acclimatized at its departure timezone
    duty->setETRTZ(-1);
    duty->setAcclimatisedState(ruleParam._accStateCurrentTz);
    duty->setAcclimatisedStateForRestStart(ruleParam._accStateCurrentTz);
    duty->setRefTimeZone(GetDepartureOffsetMinutes(duty, _dbData));
}

void AcclimatizationOfANRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
    if (_ruleParams.empty() || rosters.empty()) {
        return;
    }
    vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
    CalculateDuty(duties);
}

void AcclimatizationOfANRRule::CalculateDuty(const std::vector<Duty*>& duties) {
    if (duties.empty()) {
        return;
    }
    // single param model for now (MIN LN), pick the first
    const auto& ruleParam = _ruleParams.front();
    const auto minLocalNights = ruleParam._minLocalNights;

    // initialise first duty as acclimatized to its departure timezone (base assumption)
    Duty* lastAcclimatizedDuty = duties.front();
    lastAcclimatizedDuty->setETRTZ(-1);
    lastAcclimatizedDuty->setAcclimatisedState(ruleParam._accStateCurrentTz);
    lastAcclimatizedDuty->setAcclimatisedStateForRestStart(ruleParam._accStateCurrentTz);
    int refOffset = GetDepartureOffsetMinutes(lastAcclimatizedDuty, _dbData);
    lastAcclimatizedDuty->setRefTimeZone(refOffset);

    int consecutiveLN = 0;
    // the timezone (offset minutes) we are accumulating nights for
    int lastLocalNightTZOffset = refOffset;
	time_t lastLocalNightDate = 0;

    for (size_t i = 1; i < duties.size(); ++i) {
        Duty* curr = duties[i];
        Duty* prev = duties[i - 1];

        const auto [restStartUtc, restEndUtc] = GetRestWindowUtc(prev, curr);
        const std::string restZoneId = GetRestZoneId(prev, curr, _dbData);

        auto restEndOffset = TimezoneUtils::GetTimezoneOffset(restEndUtc, restZoneId);
        int restStartOffset = restEndOffset;
        if (!restZoneId.empty()) {
            restStartOffset = TimezoneUtils::GetTimezoneOffset(restStartUtc, restZoneId);
        }

        // count local nights between prevDuty end and currDuty start at layover timezone
        auto lnDates = GetRestLocalNightDates(prev, curr, restStartOffset, restEndOffset, restZoneId);
        
		bool continueLocalNightCount = false;
		// continue accumulating local nights if last local night date is consecutive to the first local night date in current rest
        if (!lnDates.empty() && lastLocalNightDate > 0 && restStartOffset == lastLocalNightTZOffset) {
            if (lnDates.front() - lastLocalNightDate == SecondsInDay) {
                continueLocalNightCount = true;
            }
		}

		bool switchToNewTimezone = !lnDates.empty() && restStartOffset != lastLocalNightTZOffset;

        if (continueLocalNightCount) {
            // continue accumulating local nights
            consecutiveLN += static_cast<int>(lnDates.size());
            lastLocalNightDate = lnDates.back();
            lastLocalNightTZOffset = restEndOffset;
        } else if (switchToNewTimezone) {
            // switched to a new timezone during rest, reset accumulator
            lastLocalNightTZOffset = restEndOffset;
            lastLocalNightDate = lnDates.back();
            consecutiveLN = static_cast<int>(lnDates.size());
		} else if (!lnDates.empty()) {
			// same timezone with non-consecutive nights (or first block in this timezone):
			// restart from current local-night block
			lastLocalNightTZOffset = restEndOffset;
			lastLocalNightDate = lnDates.back();
			consecutiveLN = static_cast<int>(lnDates.size());
		} else if (restStartOffset != lastLocalNightTZOffset) {
			// timezone changed but this rest contributes no local night
			lastLocalNightTZOffset = restEndOffset;
			lastLocalNightDate = 0;
			consecutiveLN = 0;
		}

        if (consecutiveLN >= minLocalNights) {
            // acclimatized to the layover timezone before departing from it
            curr->setETRTZ(-1);
            curr->setAcclimatisedState(ruleParam._accStateCurrentTz);
            curr->setRefTimeZone(restEndOffset);
            curr->setAcclimatisedStateForRestStart(ruleParam._accStateCurrentTz);
            lastAcclimatizedDuty = curr;
            // Once acclimatized, reset accumulator from this timezone
            consecutiveLN = 0; // start counting for next possible timezone change
        } else {
            // If rest start time zone is the same, remain acclimatized ("A").
            if (restStartOffset == lastAcclimatizedDuty->getRefTimeZone()) {
                curr->setETRTZ(-1);
                curr->setAcclimatisedState(ruleParam._accStateCurrentTz);
                // with DST, may acc to a different time zone (rest end offset).
                curr->setRefTimeZone(restEndOffset);
                curr->setAcclimatisedStateForRestStart(ruleParam._accStateCurrentTz);
                lastAcclimatizedDuty = curr;
            } else {
                // acclimatized time remains at the previous/reference timezone until nights requirement is met
                curr->setAcclimatisedState(ruleParam._accStatePrevTz);
                curr->setRefTimeZone(lastAcclimatizedDuty->getRefTimeZone());
                curr->setAcclimatisedStateForRestStart(curr->getAcclimatisedState());
            }
        }
    }
}

std::vector<time_t> AcclimatizationOfANRRule::GetRestLocalNightDates(const Duty* prevDuty, const Duty* currDuty,
    int restStartOffsetMinutes, int restEndOffsetMinutes, const std::string& restZoneId) {
    if (prevDuty == nullptr || currDuty == nullptr) {
        return {};
    }
    auto [restStart, restEnd] = GetRestWindowUtc(prevDuty, currDuty);
    if (restEnd <= restStart) return {};

    return DutyUtils::GetLocalNightDates(restStart, restEnd, restStartOffsetMinutes, restEndOffsetMinutes, restZoneId);
}

void AcclimatizationOfANRRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(AcclimatizationOfANRRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(dbRule);
    }
    if (!_ruleParams.empty()) return;
    // fallback to string-based param
    for (const auto& singleRuleParamString : input.ruleParamString) {
        _ruleParams.emplace_back(AcclimatizationOfANRRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}
