//
// Created by Yuhao Wang on 2025/11/28.
//

#ifndef PAIRINGOPTIMIZEPROJECT_DUTYCODE_H
#define PAIRINGOPTIMIZEPROJECT_DUTYCODE_H

#include <string>
#include "DutyCodeEnum.h"

namespace DutyCode {
    class DutyCode {
    public:
        explicit DutyCode() = default;

        void SetDutyType(const DutyType type) { _dutyType = type; }
        void SetDutyCode(const std::string& code) { _dutyCode = code; }

        [[nodiscard]] DutyType GetDutyType() const { return _dutyType; }
        [[nodiscard]] const std::string& GetDutyCode() const { return _dutyCode; }

    private:
        DutyType _dutyType = DutyType::Empty;
        std::string _dutyCode;
    };
}

#endif //PAIRINGOPTIMIZEPROJECT_DUTYCODE_H