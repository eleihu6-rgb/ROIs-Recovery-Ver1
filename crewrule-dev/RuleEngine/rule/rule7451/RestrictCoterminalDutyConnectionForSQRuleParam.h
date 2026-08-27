/**
 * @file RestrictCoterminalDutyConnectionForSQRuleParam.h
 * @brief Parameters for SQ operational coterminal-duty connection restrictions (Rule 7451).
 */

#ifndef _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_PARAM_H_
#define _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_PARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"

class RestrictCoterminalDutyConnectionForSQRuleParam : public RuleParam {
public:
    explicit RestrictCoterminalDutyConnectionForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId = RULES::RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool Matches(const std::string& prevArrAirport,
                 const std::string& prevDutyAssignment,
                 const std::string& nextDepAirport,
                 const std::string& nextDutyAssignment) const;

    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }

private:
    struct MatchPattern {
        bool allowAny{true};
        bool isNegated{false};
        std::vector<std::string> values{};

        bool Matches(const std::string& candidate) const;
    };

    static MatchPattern BuildPattern(const std::string& rawValue);
    static std::string NormalizeToken(const std::string& value);

    void ParsePrevArrAirport(const std::string& value);
    void ParsePrevAssignment(const std::string& value);
    void ParseNextDepAirport(const std::string& value);
    void ParseNextAssignment(const std::string& value);

    MatchPattern _prevArrAirport{};
    MatchPattern _prevAssignment{};
    MatchPattern _nextDepAirport{};
    MatchPattern _nextAssignment{};

    std::string _prevArrAirportRaw{"*"};
    std::string _prevAssignmentRaw{"*"};
    std::string _nextDepAirportRaw{"*"};
    std::string _nextAssignmentRaw{"*"};

    int _rowNum{0};
};

#endif // _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_PARAM_H_

