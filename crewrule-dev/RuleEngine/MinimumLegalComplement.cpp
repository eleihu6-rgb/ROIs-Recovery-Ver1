#include "RuleEngine.h"

#include <algorithm>
#include <climits>
#include <cstdlib>
#include <set>
#include <tuple>

#include "RuleFactory.h"
#include "RuleParams.h"
#include "StringUtil.h"

namespace {

constexpr const char* kMinimumLegalComplementRulesParam = "MIN_LEGAL_COMPLEMENT_RULES";

struct ComplementCandidate {
	MinimalLegalComplementRef ref;
	std::string name;
	int order = INT_MAX;
	std::map<std::string, int> rankValues;
};

enum class MinimumComplementScopeType {
	Global = 0,
	DivisionOnly = 1,
	AirlineOnly = 2,
	AirlineDivision = 3,
};

struct MinimumComplementScopeEntry {
	MinimumComplementScopeType type = MinimumComplementScopeType::Global;
	std::string airline;
	std::string division;
	std::vector<int> rules;
};

std::vector<std::string> splitAny(const std::string& value, const std::string& delimiters) {
	std::vector<std::string> result;
	std::string token;
	for (char ch : value) {
		if (delimiters.find(ch) != std::string::npos) {
			if (!token.empty()) {
				result.push_back(token);
				token.clear();
			}
		}
		else {
			token.push_back(ch);
		}
	}
	if (!token.empty()) {
		result.push_back(token);
	}
	return result;
}

std::vector<int> parseRuleList(const std::string& rawRules) {
	std::vector<int> rules;
	for (auto token : splitAny(rawRules, "|,")) {
		token = trim(token);
		if (token.empty()) {
			continue;
		}
		rules.push_back(std::atoi(token.c_str()));
	}
	return rules;
}

bool parseMinimumComplementScopeEntry(const std::string& rawEntry, MinimumComplementScopeEntry& entry) {
	std::string text = trim(rawEntry);
	if (text.empty()) {
		return false;
	}

	const auto eqPos = text.find('=');
	if (eqPos == std::string::npos) {
		const auto colonPos = text.find(':');
		if (colonPos == std::string::npos) {
			entry.type = MinimumComplementScopeType::Global;
			entry.rules = parseRuleList(text);
			return !entry.rules.empty();
		}

		entry.type = MinimumComplementScopeType::AirlineOnly;
		entry.airline = strToUpper(trim(text.substr(0, colonPos)));
		entry.rules = parseRuleList(text.substr(colonPos + 1));
		return !entry.airline.empty() && !entry.rules.empty();
	}

	const std::string lhs = strToUpper(trim(text.substr(0, eqPos)));
	entry.rules = parseRuleList(text.substr(eqPos + 1));
	if (entry.rules.empty()) {
		return false;
	}

	const auto colonPos = lhs.find(':');
	if (colonPos == std::string::npos) {
		entry.type = MinimumComplementScopeType::DivisionOnly;
		entry.division = lhs;
		return !entry.division.empty();
	}

	entry.type = MinimumComplementScopeType::AirlineDivision;
	entry.airline = trim(lhs.substr(0, colonPos));
	entry.division = trim(lhs.substr(colonPos + 1));
	return !entry.airline.empty() && !entry.division.empty();
}

bool scopeEntryMatches(
	const MinimumComplementScopeEntry& entry,
	const std::string& airline,
	const std::string& division) {
	switch (entry.type) {
	case MinimumComplementScopeType::Global:
		return true;
	case MinimumComplementScopeType::DivisionOnly:
		return entry.division == division;
	case MinimumComplementScopeType::AirlineOnly:
		return entry.airline == airline;
	case MinimumComplementScopeType::AirlineDivision:
		return entry.airline == airline && entry.division == division;
	default:
		return false;
	}
}

std::vector<int> getConfiguredMinimumComplementRules(const SharedPtr<CrewDataContext>& dbData) {
	if (!dbData) {
		return {};
	}
	std::string raw = dbData->getSystemParamValue(kMinimumLegalComplementRulesParam, "");
	raw = trim(raw);
	if (raw.empty()) {
		return {};
	}

	const std::string airline = strToUpper(trim(dbData->scenario.airline));
	const std::string division = strToUpper(trim(dbData->scenario.division));

	bool hasMatch = false;
	MinimumComplementScopeEntry bestMatch;
	for (const auto& rawEntry : splitAny(raw, ";")) {
		MinimumComplementScopeEntry entry;
		if (!parseMinimumComplementScopeEntry(rawEntry, entry)) {
			continue;
		}
		if (!scopeEntryMatches(entry, airline, division)) {
			continue;
		}
		if (!hasMatch || static_cast<int>(entry.type) > static_cast<int>(bestMatch.type)) {
			bestMatch = entry;
			hasMatch = true;
		}
	}
	return hasMatch ? bestMatch.rules : std::vector<int>();
}

bool containsRule(const std::vector<int>& rules, int rule) {
	return std::find(rules.begin(), rules.end(), rule) != rules.end();
}

bool rankMatchesDivision(const RANK& rank, const std::string& division) {
	if (division.empty()) {
		return true;
	}
	const std::string rankDivision = strToUpper(trim(rank.division));
	if (rankDivision.empty()) {
		return division == "P";
	}
	return division == rankDivision || division.find(rankDivision) != std::string::npos;
}

std::map<std::string, int> filterRankValuesForDivision(
	const std::map<std::string, int>& raw,
	const SharedPtr<CrewDataContext>& dbData,
	const std::string& division) {
	std::map<std::string, int> filtered;
	if (!dbData) {
		return filtered;
	}
	for (const auto& item : raw) {
		const auto rankIt = dbData->rankMap.find(item.first);
		if (rankIt == dbData->rankMap.end()) {
			continue;
		}
		if (!rankIt->second.isMustCrewRank) {
			continue;
		}
		if (!rankMatchesDivision(rankIt->second, division)) {
			continue;
		}
		filtered[item.first] += item.second;
	}
	return filtered;
}

std::map<std::string, int> toRankMap(const composition_rank& compositionRank) {
	std::map<std::string, int> rankMap;
	for (int i = 0; i < compositionRank.rankCount; ++i) {
		const std::string rank = compositionRank.rankValue[i].rank;
		if (rank.empty()) {
			continue;
		}
		rankMap[rank] = compositionRank.rankValue[i].plan_value;
	}
	return rankMap;
}

Composition* findComposition(const SharedPtr<CrewDataContext>& dbData, long long compositionId) {
	if (!dbData) {
		return nullptr;
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compositionId) {
			return &composition;
		}
	}
	return nullptr;
}

MinimalLegalComplementRef findCompositionOptionByRankMap(
	const std::map<std::string, int>& rawRankMap,
	const SharedPtr<CrewDataContext>& dbData,
	const std::string& division) {
	MinimalLegalComplementRef result;
	const auto rankMap = filterRankValuesForDivision(rawRankMap, dbData, division);
	if (rankMap.empty() || !dbData) {
		return result;
	}

	int bestOrder = INT_MAX;
	for (const auto& compOptions : dbData->compositionRankOptionMap) {
		Composition* composition = findComposition(dbData, compOptions.first);
		for (const auto& optionRank : compOptions.second) {
			const auto optionMap = toRankMap(optionRank.second);
			if (optionMap == rankMap && composition->getOrder() < bestOrder) {
				bestOrder = composition->getOrder();
				result.compositionId = compOptions.first;
				result.optionId = optionRank.first;
			}
		}
	}
	return result;
}

MinimalLegalComplementRef getFlightCompositionRef(Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	MinimalLegalComplementRef result;
	if (duty == nullptr || !dbData) {
		return result;
	}
	const std::string division = strToUpper(trim(dbData->scenario.division));
	int selectedOrder = INT_MIN;
	for (auto* segment : duty->getSegmentsRead()) {
		if (segment == nullptr || !segment->getIsOperating() || segment->getAssignment() == "DHD" || segment->getAssignment() == "BUS") {
			continue;
		}
		MinimalLegalComplementRef segmentRef =
			findCompositionOptionByRankMap(segment->getPlanComposition(), dbData, division);
		Composition* composition = findComposition(dbData, segmentRef.compositionId);
		if (composition == nullptr) {
			continue;
		}
		if (result.compositionId == 0 || composition->getOrder() > selectedOrder) {
			selectedOrder = composition->getOrder();
			result = segmentRef;
		}
	}
	return result;
}

std::vector<ComplementCandidate> buildCandidatesFrom(
	const MinimalLegalComplementRef& startRef,
	const SharedPtr<CrewDataContext>& dbData) {
	std::vector<ComplementCandidate> candidates;
	if (!dbData) {
		return candidates;
	}

	const std::string division = strToUpper(trim(dbData->scenario.division));
	int startOrder = INT_MIN;
	if (startRef.compositionId != 0) {
		Composition* startComposition = findComposition(dbData, startRef.compositionId);
		if (startComposition == nullptr) {
			return candidates;
		}
		startOrder = startComposition->getOrder();
	}

	for (auto& composition : dbData->compositionList) {
		if (composition.getOrder() < startOrder) {
			continue;
		}
		const auto optionIt = dbData->compositionRankOptionMap.find(composition.getCompositionId());
		if (optionIt != dbData->compositionRankOptionMap.end()) {
			const composition_rank* selectedOptionRank = nullptr;
			int selectedOptionId = INT_MAX;
			for (const auto& optionRank : optionIt->second) {
				if (optionRank.first >= selectedOptionId) {
					continue;
				}
				const std::map<std::string, int> rankValues =
					filterRankValuesForDivision(toRankMap(optionRank.second), dbData, division);
				if (!rankValues.empty()) {
					selectedOptionId = optionRank.first;
					selectedOptionRank = &optionRank.second;
				}
			}
			if (selectedOptionRank != nullptr) {
				ComplementCandidate candidate;
				candidate.ref.compositionId = composition.getCompositionId();
				candidate.ref.optionId = selectedOptionId;
				candidate.name = composition.getName();
				candidate.order = composition.getOrder();
				candidate.rankValues = filterRankValuesForDivision(toRankMap(*selectedOptionRank), dbData, division);
				candidates.push_back(candidate);
			}
		}
		else {
			const auto rankIt = dbData->compositionRankMap.find(composition.getCompositionId());
			if (rankIt != dbData->compositionRankMap.end()) {
				std::map<std::string, int> rankValues = filterRankValuesForDivision(toRankMap(rankIt->second), dbData, division);
				if (rankValues.empty()) {
					continue;
				}
				ComplementCandidate candidate;
				candidate.ref.compositionId = composition.getCompositionId();
				candidate.ref.optionId = 0;
				candidate.name = composition.getName();
				candidate.order = composition.getOrder();
				candidate.rankValues = std::move(rankValues);
				candidates.push_back(candidate);
			}
		}
	}

	std::stable_sort(candidates.begin(), candidates.end(), [](const ComplementCandidate& lhs, const ComplementCandidate& rhs) {
		if (lhs.order != rhs.order) {
			return lhs.order < rhs.order;
		}
		if (lhs.ref.compositionId != rhs.ref.compositionId) {
			return lhs.ref.compositionId < rhs.ref.compositionId;
		}
		return lhs.ref.optionId < rhs.ref.optionId;
	});
	return candidates;
}

bool applyCandidateToDuty(Duty* duty, const ComplementCandidate& candidate) {
	if (duty == nullptr) {
		return false;
	}
	duty->setCompositionId(candidate.ref.compositionId);
	duty->setCompositionName(candidate.name);
	duty->setComplementMap(candidate.rankValues);
	return true;
}

bool supportsSingleDutyCheck(const BasicRule* rule) {
	return rule != nullptr && (rule->GetAvailableInterface() & RuleInterface::SingleDuty) != 0;
}

std::vector<BasicRule*> getSupportedDutyCheckRules(RuleFactory* ruleFactory, const std::vector<int>& configuredRules) {
	std::vector<BasicRule*> rules;
	if (ruleFactory == nullptr) {
		return rules;
	}
	for (int function : configuredRules) {
		BasicRule* rule = ruleFactory->GetCheckBasicRuleByFunction(static_cast<unsigned int>(function));
		if (!supportsSingleDutyCheck(rule)) {
			continue;
		}
		rules.push_back(rule);
	}
	return rules;
}

MinimumLegalComplementRange calculateAnrNoPairingMinimumLegalComplementRange(
	Duty* duty,
	const SharedPtr<CrewDataContext>& dbData,
	RuleFactory* ruleFactory,
	const vector<string>& checkCompositionNames) {

	MinimumLegalComplementRange range;

	auto* basicRule = ruleFactory->GetCheckBasicRuleByFunction(RULES::ANR_MAX_FLIGHT_DUTY_PERIOD);
	auto* coverageProvider = dynamic_cast<MinimumLegalComplementCoverageRule*>(basicRule);
	if (coverageProvider == nullptr) {
		return range;
	}

	const std::string originalCompositionName = duty->getCompositionName();
	const long long originalCompositionId = duty->getCompositionId();
	const std::map<std::string, int> originalComplements = duty->getComplementMap();

	for (const auto& compName : checkCompositionNames) {
		duty->setCompositionName(compName);
		const auto coverage = coverageProvider->getMinimumLegalComplementCoverage(duty);
		if (coverage == MinimumLegalComplementCoverage::None) {
			continue;
		}
		MinimumLegalComplementOption option;
		option.compositionName = compName;
		option.coverage = coverage;
		range.options.push_back(option);
		if (coverage == MinimumLegalComplementCoverage::Full) 
			break;
	}

	duty->setCompositionId(originalCompositionId);
	duty->setCompositionName(originalCompositionName);
	duty->setComplementMap(originalComplements);

	return range;
}

} // namespace

bool LegalityChecker::checkMinimumLegalComplementCandidate(Duty* duty, const std::vector<int>& configuredRules) {
	const auto ruleViolationsSize = _rule_violations.size();
	const auto violationsSize = _violations.size();
	bool legal = true;
	const std::vector<BasicRule*> rules = getSupportedDutyCheckRules(_ruleFactory.get(), configuredRules);
	for (BasicRule* rule : rules) {
		rule->setRuleLegality(nullptr);
		legal = rule->CheckRule(duty);
		if (!legal) {
			break;
		}
	}

	while (_rule_violations.size() > ruleViolationsSize) {
		delete _rule_violations.back();
		_rule_violations.pop_back();
	}
	if (_violations.size() > violationsSize) {
		_violations.erase(_violations.begin() + violationsSize, _violations.end());
	}
	return legal;
}

bool LegalityChecker::calculateMinimumLegalComplements(Pairing* pairing) {
	if (GetApplication() == PAIRING_OPTIMIZER) {
		return false;
	}

	const std::vector<int> configuredRules = getConfiguredMinimumComplementRules(_dbData);
	for (auto* duty : pairing->getDutyVec()) {
		if (duty == nullptr) {
			continue;
		}
		duty->setMinimumLegalComplement(calculateMinimumLegalComplementForDuty(duty, configuredRules));
	}
	return true;
}

MinimalLegalComplementRef LegalityChecker::calculateMinimumLegalComplementForDuty(
	Duty* duty,
	const std::vector<int>& configuredRules) {
	const MinimalLegalComplementRef startRef = getFlightCompositionRef(duty, _dbData);
	if (duty == nullptr || !_dbData) {
		return MinimalLegalComplementRef();
	}
	if (configuredRules.empty()) {
		return startRef;
	}
	if (containsRule(configuredRules, RULES::RANK_POSITION_COMB)) {
		MinimalLegalComplementRef result = startRef;
		result.from8091 = result.compositionId != 0;
		return result;
	}
	if (getSupportedDutyCheckRules(_ruleFactory.get(), configuredRules).empty()) {
		return startRef;
	}

	const std::string originalCompositionName = duty->getCompositionName();
	const long long originalCompositionId = duty->getCompositionId();
	const std::map<std::string, int> originalComplements = duty->getComplementMap();

	for (const auto& candidate : buildCandidatesFrom(startRef, _dbData)) {
		applyCandidateToDuty(duty, candidate);
		if (checkMinimumLegalComplementCandidate(duty, configuredRules)) {
			duty->setCompositionId(originalCompositionId);
			duty->setCompositionName(originalCompositionName);
			duty->setComplementMap(originalComplements);
			return candidate.ref;
		}
	}

	duty->setCompositionId(originalCompositionId);
	duty->setCompositionName(originalCompositionName);
	duty->setComplementMap(originalComplements);
	return MinimalLegalComplementRef();
}

MinimumLegalComplementRange LegalityChecker::calculateMinimumLegalComplementRange(Duty* duty, const vector<string>& checkCompositionNames) {
	MinimumLegalComplementRange range;
	if (checkCompositionNames.empty() ) {
		return range;
	}
	const std::vector<int> configuredRules = getConfiguredMinimumComplementRules(_dbData);

	auto& firstCompsition = checkCompositionNames.front();

	if (configuredRules.empty() || containsRule(configuredRules, RULES::RANK_POSITION_COMB)) {
		MinimumLegalComplementOption option;
		option.compositionName = firstCompsition;
		option.coverage = MinimumLegalComplementCoverage::Full;
		range.options.push_back(option);
		return range;
	}
	if (containsRule(configuredRules, RULES::ANR_MAX_FLIGHT_DUTY_PERIOD)) {
		MinimumLegalComplementRange anrRange =
			calculateAnrNoPairingMinimumLegalComplementRange(duty, _dbData, _ruleFactory.get(), checkCompositionNames);
		return anrRange;
	}
	const std::string originalCompositionName = duty->getCompositionName();
	const long long originalCompositionId = duty->getCompositionId();
	const std::map<std::string, int> originalComplements = duty->getComplementMap();

	for (auto& compName : checkCompositionNames) {
		duty->setCompositionName(compName);
		if (checkMinimumLegalComplementCandidate(duty, configuredRules)) {
			MinimumLegalComplementOption option;
			option.compositionName = compName;
			option.coverage = MinimumLegalComplementCoverage::Full;
			range.options.push_back(option);
			break;
		}
	}

	duty->setCompositionId(originalCompositionId);
	duty->setCompositionName(originalCompositionName);
	duty->setComplementMap(originalComplements);

	return range;
}
