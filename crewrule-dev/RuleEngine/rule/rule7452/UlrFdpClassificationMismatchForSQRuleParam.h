/**
 * @file UlrFdpClassificationMismatchForSQRuleParam.h
 */

#ifndef _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_PARAM_H_
#define _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_PARAM_H_

#include <limits>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"

class UlrFdpClassificationMismatchForSQRuleParam : public RuleParam {
public:
    explicit UlrFdpClassificationMismatchForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ULR_FDP_CLASSIFICATION_MISMATCH;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool MatchesDutyPattern(const std::string& dutyDep, const std::string& dutyArr) const;
    bool MatchesUlr(bool dutyIsUlr) const;
    bool IsFdpInRange(int fdpMinutes) const;

    const std::vector<std::string>& GetFleetGroupsUpper() const { return _fleetGroupsUpper; }
    const std::string& GetFleetGroupLabel() const { return _fleetGroupLabel; }
    const std::string& GetDutyPatternLabel() const { return _dutyPatternLabel; }
    const std::string& GetIsUlrLabel() const { return _isUlrLabel; }
    const std::string& GetMinFdpLabel() const { return _minFdpLabel; }
    const std::string& GetMaxFdpLabel() const { return _maxFdpLabel; }
    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }

private:
    enum class UlrRequirement {
        Any,
        Require,
        Forbid
    };

    struct DutyPattern {
        std::string depUpper{};
        std::string arrUpper{};
        bool depWildcard{true};
        bool arrWildcard{true};
    };

    DutyPattern _dutyPattern{};
    std::string _dutyPatternLabel{"*"};
    std::vector<std::string> _fleetGroupsUpper{};
    std::string _fleetGroupLabel{"*"};
    UlrRequirement _ulrRequirement{UlrRequirement::Any};
    std::string _isUlrLabel{"*"};
    int _minFdpMinutes{0};
    int _maxFdpMinutes{std::numeric_limits<int>::max()};
    bool _checkMinFdp{false};
    bool _checkMaxFdp{false};
    std::string _minFdpLabel{"*"};
    std::string _maxFdpLabel{"*"};
    int _rowNum{0};

    void applyHeaderValue(const std::string& headerUpper, const std::string& value);
    static bool isAllTokenUpper(const std::string& valueUpper);
    static int parseDurationMinutes(const std::string& value, int defaultValue);
    static std::vector<std::string> splitPipeUpper(const std::string& raw);
    void parseDutyPattern(const std::string& value);
};

#endif // _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_PARAM_H_
