//
// Created by haoli on 2025/8/18.
//

#ifndef TRAININGOPTIMIZER_ICONVERTER_H
#define TRAININGOPTIMIZER_ICONVERTER_H

#include "optional"
#include "typeinfo"
#include "string"
#include "TargetVariant.h"

class IConverter {
public:
    virtual ~IConverter() = default;

    [[nodiscard]] virtual std::optional<TargetVariant> Convert(const std::any& src) const = 0;

    [[nodiscard]] virtual std::string TypeName() const = 0;
};


#endif //TRAININGOPTIMIZER_ICONVERTER_H
