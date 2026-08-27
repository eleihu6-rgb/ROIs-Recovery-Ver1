/**
 * @file MinPairingDaysForUlrStandbyRuleParam.h
 * @brief Parameters for CA ULR pairing minimum length (rule 7435).
 */

#ifndef RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULEPARAM_H_
#define RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULEPARAM_H_

#include <string>
#include <vector>

#include "RuleParam.h"
#include "RuleSystemDefine.h"

class MinPairingDaysForUlrStandbyRule;

class MinPairingDaysForUlrStandbyRuleParam : public RuleParam {
    friend class MinPairingDaysForUlrStandbyRule;
public:
    explicit MinPairingDaysForUlrStandbyRuleParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ULR_PAIRING_MIN_DAYS;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    int GetMinPairingDays() const { return _minPairingDays; }

private:
    enum class UlrRequirement {
        Any,
        Require,
        Forbid
    };
    enum class PairingLengthEndsAt {
        Transport,
        Debrief
    };

    std::string _serviceTypeUpper{"*"};
    std::vector<std::string> _fleetGroupsUpper{};
    UlrRequirement _ulrRequirement{UlrRequirement::Any};
    std::vector<std::string> _layoverAirportsUpper{};
    std::vector<std::string> _layoverCountriesUpper{};
    std::vector<std::string> _assignmentsUpper{};
    int _minPairingDays{0};
    PairingLengthEndsAt _pairingLengthEndsAt{PairingLengthEndsAt::Transport};
    int _rowNum{0};

    static std::string NormalizeToken(const std::string& value);
    static void ParseListValue(const std::string& value, std::vector<std::string>& target);
    static PairingLengthEndsAt ParsePairingLengthEndsAt(const std::string& value);
    void ApplyHeader(const std::string& headerUpper, const std::string& value);
    void ParseUlrRequirement(const std::string& value);
};

#endif  // RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULEPARAM_H_
