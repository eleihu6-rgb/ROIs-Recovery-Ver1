/**
 * @file RestrictCoterminalDutyConnectionForSQRule.h
 * @brief Rule 7451 - SQ operational: restrict coterminal connections between duties.
 */

#ifndef _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_H_
#define _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "RestrictCoterminalDutyConnectionForSQRuleParam.h"

class Segment;

class RestrictCoterminalDutyConnectionForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit RestrictCoterminalDutyConnectionForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~RestrictCoterminalDutyConnectionForSQRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    std::vector<RestrictCoterminalDutyConnectionForSQRuleParam> _restrictedConnections;
    bool _isConfigured{false};

    void ParseParam(const InputType& input);
    bool IsActiveRow(const DBRule& dbRule) const;

    bool CheckDutySegments(const Duty* duty) const;
    bool CheckDutyConnections(const std::vector<Duty*>& duties) const;

    bool IsCoterminalAirportPair(const std::string& airportA, const std::string& airportB) const;
    std::string GetAirportCityCode(const std::string& airport) const;

    void ReportRestrictedConnectionViolation(const Duty* prevDuty,
                                             const Segment* prevLastSeg,
                                             const Duty* nextDuty,
                                             const Segment* nextFirstSeg,
                                             const RestrictCoterminalDutyConnectionForSQRuleParam& param) const;

    void ReportDeadheadBetweenCoterminalsViolation(const Duty* duty,
                                                   const Segment* segment) const;
};

#endif // _RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ_RULE_H_

