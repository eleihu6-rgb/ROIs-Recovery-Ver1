/**
 * @file CheckMinSpaceBetweenDutyForF8RuleParam.cpp
**/

#include <map>
#include <cctype>
#include <climits>
#include "UtilFunc.h"
#include "Utility.h"
#include "Duty.h"
#include "CheckMinSpaceBetweenDutyForF8RuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "framework/period/WorkPeriod.h"
#include "Pairing.h"

using namespace std;

namespace {

	constexpr int kWoclStartMinutes = 2 * 60 + 0;
	constexpr int kWoclEndMinutes = 5 * 60 + 59;

	int GetAdjustOffsetTZMinutesForWocl(const WorkPeriod* wp, int offsetTZMinutes) {
		const int accAtStart = wp->GetAccTimezoneAtStart();
		if (accAtStart >= 0)
			return accAtStart;
		if (wp->GetWorkType() == WorkType::FltDuty && wp->GetWork() != nullptr) {
			const auto* duty = static_cast<const Duty*>(wp->GetWork());
			const int refTz = duty->getRefTimeZone();
			if (refTz != INT_MIN)
				return refTz;
		}
		return offsetTZMinutes;
	}

	bool IsWoclDutyBasedOnAcclimatization(const WorkPeriod* wp, int woclStartAcc, int woclEndAcc, int fallbackOffsetTZMinutes) {
		const time_t fdpStartUtc = wp->GetStartTimeUTC();
		const time_t fdpEndUtc = wp->GetEndTimeUTC();
		// Ground rosters (and any work period without an acclimatized timezone) leave
		// _accTimezoneAtStart at its -1 default, so the WOCL window must be evaluated in
		// the crew-base/refTimeZone local time, not raw UTC.
		const int accOffsetMinutes = GetAdjustOffsetTZMinutesForWocl(wp, fallbackOffsetTZMinutes);
		if (fdpStartUtc <= 0 || fdpEndUtc <= 0)
			return false;
		return TimeUtils::IsTimesCovered(fdpStartUtc + accOffsetMinutes * 60, fdpEndUtc + accOffsetMinutes * 60, woclStartAcc, woclEndAcc);
	}

	bool IsWoclDutyBasedOnAcclimatization(const Duty* duty, int woclStartLoc, int woclEndLoc) {
		int acc = duty->getRefTimeZone();
		
		const time_t fdpStartUtc = duty->getFDPStartUtcTimes("ACT");
		const time_t fdpEndUtc = duty->getFDPEndUtcTimes("ACT");
		if (fdpStartUtc <= 0 || fdpEndUtc <= 0)
			return false;
		return TimeUtils::IsTimesCovered(fdpStartUtc + acc * 60, fdpEndUtc + acc * 60, woclStartLoc, woclEndLoc);
	}

	static string trimToken(const string& raw) {
		size_t i = 0, j = raw.size();
		while (i < j && isspace(static_cast<unsigned char>(raw[i]))) ++i;
		while (j > i && isspace(static_cast<unsigned char>(raw[j - 1]))) --j;
		return raw.substr(i, j - i);
	}

	static string collectWorkPeriodAttributePipeString(const WorkPeriod* wp, bool applyPrelabelledAttributes) {
		if (wp == nullptr)
			return {};
		const ROSTER* r = wp->GetRoster();
		if (r == nullptr)
			return {};
		string s;
		if (wp->GetWorkType() != WorkType::FltDuty) {
			return r->attribute;
		}
		const Pairing* pg = r->pairing;
		const Duty* d = static_cast<const Duty*>(wp->GetWork());
		if (applyPrelabelledAttributes && pg != nullptr && !pg->getAttribute().empty()) {
			s = pg->getAttribute();
		}
		if (d != nullptr) {
			const string da = d->getAttributes();
			if (!da.empty())
				s = s.empty() ? da : s + "|" + da;
		}
		if (!r->attribute.empty())
			s = s.empty() ? r->attribute : s + "|" + r->attribute;
		return s;
	}

	static string collectRosterAttributePipeString(const ROSTER* r, bool applyPrelabelledAttributes) {
		if (r == nullptr)
			return {};
		if (r->pairing == nullptr)
			return r->attribute;
		string s;
		const Pairing* pg = r->pairing;
		if (applyPrelabelledAttributes && !pg->getAttribute().empty())
			s = pg->getAttribute();
		for (Duty* d : pg->getDutyVec()) {
			if (d == nullptr)
				continue;
			const string da = d->getAttributes();
			if (!da.empty())
				s = s.empty() ? da : s + "|" + da;
		}
		if (!r->attribute.empty())
			s = s.empty() ? r->attribute : s + "|" + r->attribute;
		return s;
	}

	bool rosterHasAnyWoclDuty(const ROSTER* roster, int crewBaseOffsetTZMinutes) {
		if (roster == nullptr || roster->pairing == nullptr)
			return false;
		for (Duty* d : roster->pairing->getDutyVec()) {
			if (d != nullptr && IsWoclDutyBasedOnAcclimatization(d, kWoclStartMinutes, kWoclEndMinutes))
				return true;
		}
		return false;
	}

	bool vectorContainsWoclToken(const vector<string>& attrs) {
		for (const auto& raw : attrs) {
			size_t i = 0, j = raw.size();
			while (i < j && isspace(static_cast<unsigned char>(raw[i]))) ++i;
			while (j > i && isspace(static_cast<unsigned char>(raw[j - 1]))) --j;
			string t;
			t.reserve(j - i);
			for (size_t k = i; k < j; ++k)
				t += static_cast<char>(toupper(static_cast<unsigned char>(raw[k])));
			if (t == "WOCL")
				return true;
		}
		return false;
	}

	/// Pipe-delimited pairing attribute string contains a WOCL token (case-insensitive).
	bool attributePipeStringContainsWoclToken(const string& raw) {
		for (size_t start = 0; start < raw.size(); ) {
			const size_t end = raw.find('|', start);
			const string seg = raw.substr(start, end == string::npos ? raw.size() - start : end - start);
			const string t = trimToken(seg);
			string u;
			u.reserve(t.size());
			for (char c : t)
				u += static_cast<char>(toupper(static_cast<unsigned char>(c)));
			if (u == "WOCL")
				return true;
			if (end == string::npos)
				break;
			start = end + 1;
		}
		return false;
	}

	bool workPeriodPrelabelledAttributesContainWocl(const WorkPeriod* wp) {
		if (wp == nullptr)
			return false;
		const ROSTER* r = wp->GetRoster();
		if (r == nullptr || r->pairing == nullptr)
			return false;
		return attributePipeStringContainsWoclToken(r->pairing->getAttribute());
	}

	static bool parseApplyPrelabelledAttributesCell(const string& raw) {
		const string t = trimToken(raw);
		if (t.empty() || t == "*" || t == RuleParamConstant::ALL)
			return true;
		string u;
		u.reserve(t.size());
		for (char c : t)
			u += static_cast<char>(toupper(static_cast<unsigned char>(c)));
		if (u == "N" || u == "NO" || u == "FALSE" || u == "0")
			return false;
		return true;
	}

	static bool parseUtilizePostRestCell(const string& raw) {
		return parseApplyPrelabelledAttributesCell(raw);
	}

}

void CheckMinSpaceBetweenDutyForF8RuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;
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
        else if (header == "PREV ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _prevAssignmentGroups);
            }
        }
        else if (header == "NEXT ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _nextAssignmentGroups);
            }
        }
        else if (header == "PREV ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _prevAssignments);
            }
        }
        else if (header == "NEXT ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _nextAssignments);
            }
        }
        else if (header == "PREV ATTRIBUTES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _prevAttributes);
            }
        }
        else if (header == "NEXT ATTRIBUTES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _nextAttributes);
            }
        }
        else if (header == "APPLY PRELABELLED ATTRIBUTES") {
            _applyPrelabelledAttributes = parseApplyPrelabelledAttributesCell(headeValue);
        }
        else if (header == "UTILIZE POST REST") {
            _utilizePostRest = parseUtilizePostRestCell(headeValue);
        }
        else if (header == "LEVEL") {
			string v = headeValue;
			while (!v.empty() && isspace(static_cast<unsigned char>(v.front())))
				v.erase(0, 1);
			while (!v.empty() && isspace(static_cast<unsigned char>(v.back())))
				v.pop_back();
			if (v.empty() || v == RuleParamConstant::ALL)
				_level = "*";
			else
				_level = v;
        }
        else if (header == "MIN PERIOD") {
            if (headeValue != RuleParamConstant::ALL) {
                _minPeriod = stoi(headeValue);
            }
        }
        else if (header == "UNIT") {
            if (headeValue != RuleParamConstant::ALL) {
                _unit = headeValue;
            }
        }
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::prevAttributesRequireWocl() const {
	return vectorContainsWoclToken(_prevAttributes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::nextAttributesRequireWocl() const {
	return vectorContainsWoclToken(_nextAttributes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchPrevAssgsOnDutyLevel(const WorkPeriod* wp) const {
	const auto& assignment = wp->GetWorkType() != WorkType::FltDuty ? static_cast<const ROSTER*>(wp->GetWork())->qualifier : static_cast<const Duty*>(wp->GetWork())->getAssignment();

	if (!_prevAssignmentGroups.empty() && _prevAssignmentGroups[0] != "" && _prevAssignmentGroups[0] != "*") {
		bool matchGroup = false;
		for (const auto& assigmentGroup : _prevAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, assigmentGroup)) {
				matchGroup = true;
			}
		}
		if (!matchGroup)
			return false;
	}

	if (!_prevAssignments.empty() && _prevAssignments[0] != "" && _prevAssignments[0] != "*"
		&& find(_prevAssignments.begin(), _prevAssignments.end(), assignment) == _prevAssignments.end())
		return false;

	return true;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchNextAssgsOnDutyLevel(const WorkPeriod* wp) const {
	const auto& assignment = wp->GetWorkType() != WorkType::FltDuty ? static_cast<const ROSTER*>(wp->GetWork())->qualifier : static_cast<const Duty*>(wp->GetWork())->getAssignment();

	if (!_nextAssignmentGroups.empty() && _nextAssignmentGroups[0] != "" && _nextAssignmentGroups[0] != "*") {
		bool matchGroup = false;
		for (const auto& assigmentGroup : _nextAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, assigmentGroup)) {
				matchGroup = true;
			}
		}
		if (!matchGroup)
			return false;
	}

	if (!_nextAssignments.empty() && _nextAssignments[0] != "" && _nextAssignments[0] != "*"
		&& find(_nextAssignments.begin(), _nextAssignments.end(), assignment) == _nextAssignments.end())
		return false;

	return true;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchPrevAttributesOnlyDuty(const WorkPeriod* wp) const {
	if (_prevAttributes.empty())
		return true;
	vector<string> crit;
	for (const auto& raw : _prevAttributes) {
		const string t = trimToken(raw);
		if (t.empty() || t == "*")
			continue;

		crit.push_back(t);
	}
	if (crit.empty())
		return true;
	const string combined = collectWorkPeriodAttributePipeString(wp, _applyPrelabelledAttributes);
	return Utility::GetInstancePtr()->isPairingMatchAttributes(combined, crit);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchNextAttributesOnlyDuty(const WorkPeriod* wp) const {
	if (_nextAttributes.empty())
		return true;
	vector<string> crit;
	for (const auto& raw : _nextAttributes) {
		const string t = trimToken(raw);
		if (t.empty() || t == "*")
			continue;

		crit.push_back(t);
	}
	if (crit.empty())
		return true;
	const string combined = collectWorkPeriodAttributePipeString(wp, _applyPrelabelledAttributes);
	return Utility::GetInstancePtr()->isPairingMatchAttributes(combined, crit);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchPrevWoclShapeWorkPeriod(const WorkPeriod* wp, int offsetTZMinutes) const {
	return IsWoclDutyBasedOnAcclimatization(wp, kWoclStartMinutes, kWoclEndMinutes, offsetTZMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchNextWoclShapeWorkPeriod(const WorkPeriod* wp, int offsetTZMinutes) const {
	return IsWoclDutyBasedOnAcclimatization(wp, kWoclStartMinutes, kWoclEndMinutes, offsetTZMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchPrevWoclShapeRoster(const ROSTER* roster, int crewBaseOffsetTZMinutes) const {
	return rosterHasAnyWoclDuty(roster, crewBaseOffsetTZMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchNextWoclShapeRoster(const ROSTER* roster, int crewBaseOffsetTZMinutes) const {
	return rosterHasAnyWoclDuty(roster, crewBaseOffsetTZMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchPrevWoclShapeInPairing(const Duty* duty, const Pairing* pairing, int fallbackOffsetTZMinutes) const {
	if (!prevAttributesRequireWocl())
		return true;
	if (_applyPrelabelledAttributes) {
		if (pairing == nullptr)
			return false;
		return attributePipeStringContainsWoclToken(pairing->getAttribute());
	}
	if (duty == nullptr)
		return false;
	return IsWoclDutyBasedOnAcclimatization(duty, kWoclStartMinutes, kWoclEndMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::matchNextWoclShapeInPairing(const Duty* duty, const Pairing* pairing, int fallbackOffsetTZMinutes) const {
	if (!nextAttributesRequireWocl())
		return true;
	if (_applyPrelabelledAttributes) {
		if (pairing == nullptr)
			return false;
		return attributePipeStringContainsWoclToken(pairing->getAttribute());
	}
	if (duty == nullptr)
		return false;
	return IsWoclDutyBasedOnAcclimatization(duty, kWoclStartMinutes, kWoclEndMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchesPrevDutyPattern(const WorkPeriod* wp, int offsetTZMinutes) const {
	//检查duty层级的assignments是否匹配法规里设定的assignments
    if (!MatchPrevAssgsOnDutyLevel(wp))
		return false;

    //检查duty层级的attributes是否匹配法规里设定的attributes
    if(_applyPrelabelledAttributes)
        MatchPrevAttributesOnlyDuty(wp);
    else{
        if(prevAttributesRequireWocl()){
            if (!matchPrevWoclShapeWorkPeriod(wp, offsetTZMinutes))
                return false;
            else
                return true;
        }
    }

	return false;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchesNextDutyPattern(const WorkPeriod* wp, int offsetTZMinutes) const {
	//检查duty层级的assignments是否匹配法规里设定的assignments
    if (!MatchNextAssgsOnDutyLevel(wp))
		return false;

    //检查duty层级的attributes是否匹配法规里设定的attributes
    if(_applyPrelabelledAttributes)
        MatchNextAttributesOnlyDuty(wp);
    else{
        if(nextAttributesRequireWocl()){
            if (!matchNextWoclShapeWorkPeriod(wp, offsetTZMinutes))
                return false;
            else
                return true;
        }
    }

	return false;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::isRosterPairingLevel() const {
	const string t = trimToken(_level);
	if (t.size() != 1)
		return false;
	return toupper(static_cast<unsigned char>(t[0])) == 'P';
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchPrevAssgsOnPairingLevel(const ROSTER* roster) const {
	if (roster == nullptr)
		return false;
	const auto& assignment = roster->qualifier;

	if (!_prevAssignmentGroups.empty() && _prevAssignmentGroups[0] != "" && _prevAssignmentGroups[0] != "*") {
		bool matchGroup = false;
		for (const auto& assigmentGroup : _prevAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, assigmentGroup)) {
				matchGroup = true;
			}
		}
		if (!matchGroup)
			return false;
	}

	if (!_prevAssignments.empty() && _prevAssignments[0] != "" && _prevAssignments[0] != "*"
		&& find(_prevAssignments.begin(), _prevAssignments.end(), assignment) == _prevAssignments.end())
		return false;

	return true;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchNextAssgsOnPairingLevel(const ROSTER* roster) const {
	if (roster == nullptr)
		return false;
	const auto& assignment = roster->qualifier;

	if (!_nextAssignmentGroups.empty() && _nextAssignmentGroups[0] != "" && _nextAssignmentGroups[0] != "*") {
		bool matchGroup = false;
		for (const auto& assigmentGroup : _nextAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, assigmentGroup)) {
				matchGroup = true;
			}
		}
		if (!matchGroup)
			return false;
	}

	if (!_nextAssignments.empty() && _nextAssignments[0] != "" && _nextAssignments[0] != "*"
		&& find(_nextAssignments.begin(), _nextAssignments.end(), assignment) == _nextAssignments.end())
		return false;

	return true;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchPrevAttributesOnlyRoster(const ROSTER* roster) const {
	if (_prevAttributes.empty())
		return true;
	vector<string> crit;
	for (const auto& raw : _prevAttributes) {
		const string t = trimToken(raw);
		if (t.empty() || t == "*")
			continue;

		crit.push_back(t);
	}
	if (crit.empty())
		return true;
	const string combined = _applyPrelabelledAttributes
		? (roster != nullptr && roster->pairing != nullptr ? roster->pairing->getAttribute() : string{})
		: collectRosterAttributePipeString(roster, _applyPrelabelledAttributes);
	return Utility::GetInstancePtr()->isPairingMatchAttributes(combined, crit);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchNextAttributesOnlyRoster(const ROSTER* roster) const {
	if (_nextAttributes.empty())
		return true;
	vector<string> crit;
	for (const auto& raw : _nextAttributes) {
		const string t = trimToken(raw);
		if (t.empty() || t == "*")
			continue;

		crit.push_back(t);
	}
	if (crit.empty())
		return true;
	const string combined = _applyPrelabelledAttributes
		? (roster != nullptr && roster->pairing != nullptr ? roster->pairing->getAttribute() : string{})
		: collectRosterAttributePipeString(roster, _applyPrelabelledAttributes);
	return Utility::GetInstancePtr()->isPairingMatchAttributes(combined, crit);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchesPrevPairingPattern(const ROSTER* roster, int crewBaseOffsetTZMinutes) const {
	//检查pairing/roster层级的assignments是否匹配法规里设定的assignments
    if (!MatchPrevAssgsOnPairingLevel(roster))
		return false;

    //检查pairing/roster层级的attributes是否匹配法规里设定的attributes
    // 1. 如果attribute是pairing/duty的固定属性，则可以预先打好标签
	if (_applyPrelabelledAttributes)
		return MatchPrevAttributesOnlyRoster(roster);
	else{ //2. 如果attribute不是pairing/duty的固定属性，需要特殊定制
	    if(prevAttributesRequireWocl()){ //根据acclimatized时间计算是不是WOCL
			if(!matchPrevWoclShapeRoster(roster, crewBaseOffsetTZMinutes))
			    return false;
			else
			    return true;
		}
	}
	return false;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchesNextPairingPattern(const ROSTER* roster, int crewBaseOffsetTZMinutes) const {
	//检查pairing/roster层级的assignments是否匹配法规里设定的assignments
    if (!MatchNextAssgsOnPairingLevel(roster))
		return false;

    //检查pairing/roster层级的attributes是否匹配法规里设定的attributes
    // 1. 如果attribute是pairing/duty的固定属性，则可以预先打好标签
	if (_applyPrelabelledAttributes)
		return MatchNextAttributesOnlyRoster(roster);
	else{ //2. 如果attribute不是pairing/duty的固定属性，需要特殊定制
	    if(nextAttributesRequireWocl()){
			if (!matchNextWoclShapeRoster(roster, crewBaseOffsetTZMinutes))
				return false;
			else
			    return true;
		}
	}

	return false;
}


bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchRuleParam(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod, int offsetTZMinutes) const {
	return MatchesPrevDutyPattern(currentWokrPeriod, offsetTZMinutes) && MatchesNextDutyPattern(nextWorkPeriod, offsetTZMinutes);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchRuleParam(const Duty * currentWokrPeriod, const Duty * nextWorkPeriod) const {
    return MatchAssignment(currentWokrPeriod, nextWorkPeriod);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchAssignment(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const {
    const auto& currentAssignment = currentWokrPeriod->getAssignment();
    const auto& nextAssignment = nextWorkPeriod->getAssignment();

    if (!_prevAssignmentGroups.empty() && _prevAssignmentGroups[0] != "" && _prevAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _prevAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(currentAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_prevAssignments.empty() && _prevAssignments[0] != "" && _prevAssignments[0] != "*"
        && find(_prevAssignments.begin(), _prevAssignments.end(), currentAssignment) == _prevAssignments.end())
        return false;

    if (!_nextAssignmentGroups.empty() && _nextAssignmentGroups[0] != "" && _nextAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _nextAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(nextAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_nextAssignments.empty() && _nextAssignments[0] != "" && _nextAssignments[0] != "*"
        && find(_nextAssignments.begin(), _nextAssignments.end(), nextAssignment) == _nextAssignments.end())
        return false;

    return true;
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::MatchAssignment(const WorkPeriod* currentWokrPeriod, const WorkPeriod* nextWorkPeriod) const {
	return MatchPrevAssgsOnDutyLevel(currentWokrPeriod) && MatchNextAssgsOnDutyLevel(nextWorkPeriod);
}

bool CheckMinSpaceBetweenDutyForF8RuleParam::CheckMinRest(const time_t restStartTime, const time_t restEndTime, int restStartOffset, int restEndOffset) const {

    if (_unit != "RH" && _unit != "CD")
        return true;

    time_t minRestEnd = std::numeric_limits<time_t>::max();
    if (_unit == "RH") {
        minRestEnd = restStartTime + _minPeriod * 3600;
    }
    else if (_unit == "CD") {
        const auto & startDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(restStartTime, restStartOffset) + (3600 * 24);
        minRestEnd = startDay + _minPeriod * (3600 * 24);
    }

    if (restEndTime < minRestEnd) {
        return false;
    }

    return true;
}
